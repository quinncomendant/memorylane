import * as fs from 'fs';
import { extractText } from './ocr';
import { EmbeddingService } from './embedding';
import { StorageService, StoredEvent } from './storage';
import { Screenshot, InteractionContext, SearchOptions, SearchFilters } from '../../shared/types';
import { SemanticClassifierService } from './semantic-classifier';

export class EventProcessor {
  private embeddingService: EmbeddingService;
  private storageService: StorageService;
  private classifierService: SemanticClassifierService | null = null;
  
  // Event aggregation state (moved from recorder for separation of concerns)
  private pendingEvents: InteractionContext[] = [];
  
  // Classification state - track START screenshot for START/END pairs
  private startScreenshot: Screenshot | null = null;
  private startEvents: InteractionContext[] = [];
  private startOcrText = '';

  constructor(embeddingService: EmbeddingService, storageService: StorageService, classifierService?: SemanticClassifierService) {
    this.embeddingService = embeddingService;
    this.storageService = storageService;
    this.classifierService = classifierService || null;
  }

  /**
   * Add an interaction event to the pending events list.
   * Events are aggregated here and associated with screenshots during processing.
   */
  public addInteractionEvent(event: InteractionContext): void {
    this.pendingEvents.push(event);
  }

  /**
   * Main pipeline: OCR -> Embed -> Store -> Classification -> Cleanup
   * 
   * Flow:
   * 1. OCR extracts text from screenshot (needs file)
   * 2. Generate embedding from text
   * 3. Store in database
   * 4. If classifier enabled: track START/END pairs for classification
   * 5. Classification runs (needs both screenshot files)
   * 6. Delete screenshot files after classification (or immediately if no classifier)
   */
  public async processScreenshot(screenshot: Screenshot): Promise<void> {
    const { filepath, id } = screenshot;
    
    // Grab pending events and reset for next screenshot
    const events = [...this.pendingEvents];
    this.pendingEvents = [];
    console.log(`[EventProcessor] Processing screenshot ${id} with ${events.length} accumulated events`);
    console.log(`[EventProcessor] Events: ${JSON.stringify(events)}`);
    
    try {
      // 1. OCR - needs the file to exist
      if (!fs.existsSync(filepath)) {
          console.warn(`File not found for screenshot ${id}: ${filepath}`);
          return;
      }

      const text = await extractText(filepath);
      console.log(`[EventProcessor] OCR complete for ${id}. Text length: ${text.length}`);

      // 2. Semantic Classification (START/END pair tracking)
      if (this.classifierService) {
        if (!this.startScreenshot) {
          // This is the START screenshot - keep file and OCR for classification
          this.setStartState(screenshot, events, text);
        } else {
          // Check if app changed between START and END
          const appChanged = this.hasAppChange(events);

          if (appChanged) {
            // App change: use single-image classification for START only
            console.log(`[EventProcessor] App change detected, using single-image classification`);
            const summary = await this.runClassification(this.startScreenshot, undefined, this.startEvents);
            await this.storeAndCleanup(this.startScreenshot, this.startOcrText, summary, this.startEvents, 'app change, single-image');
          } else {
            // Normal flow: two-image classification (same app)
            const allEvents = [...this.startEvents, ...events];
            const summary = await this.runClassification(this.startScreenshot, screenshot, allEvents);
            await this.storeAndCleanup(this.startScreenshot, this.startOcrText, summary, allEvents);
          }

          // END becomes new START (keep its file for next classification)
          this.setStartState(screenshot, events, text);
        }
      } else {
        // No classifier - store OCR only with empty summary, then delete
        await this.storeAndCleanup(screenshot, text, '', events, 'no classifier');
      }
      
    } catch (error) {
      console.error(`Error processing screenshot ${id}:`, error);
      throw error;
    }
  }

  /**
   * Run classification and return summary. Handles errors gracefully.
   */
  private async runClassification(
    startScreenshot: Screenshot,
    endScreenshot: Screenshot | undefined,
    events: InteractionContext[]
  ): Promise<string> {
    console.log(`[EventProcessor] START screenshot: ${startScreenshot.id}`);
    if (endScreenshot) {
      console.log(`[EventProcessor] END screenshot: ${endScreenshot.id}`);
    }

    try {
      const summary = await this.classifierService!.classify({
        startScreenshot,
        endScreenshot,
        events,
      });
      console.log(`[EventProcessor] Classification summary: ${summary}`);
      return summary;
    } catch (error) {
      console.error('[EventProcessor] Classification failed:', error);
      return 'Classification failed';
    }
  }

  /**
   * Store event to database and delete the screenshot file.
   */
  private async storeAndCleanup(
    screenshot: Screenshot,
    ocrText: string,
    summary: string,
    events: InteractionContext[],
    logSuffix?: string
  ): Promise<void> {
    const vector = await this.embeddingService.generateEmbedding(summary || ocrText);
    const appName = this.extractAppName(events);
    const storedEvent: StoredEvent = {
      id: screenshot.id,
      timestamp: screenshot.timestamp,
      text: ocrText,
      summary,
      appName,
      vector
    };
    await this.storageService.addEvent(storedEvent);
    
    const suffix = logSuffix ? ` (${logSuffix}, app: ${appName})` : ` (app: ${appName})`;
    console.log(`[EventProcessor] Stored event for ${screenshot.id}${suffix}`);
    
    this.deleteScreenshot(screenshot.filepath);
  }

  /**
   * Update the START state for the next classification pair.
   */
  private setStartState(screenshot: Screenshot, events: InteractionContext[], ocrText: string): void {
    this.startScreenshot = screenshot;
    this.startEvents = events;
    this.startOcrText = ocrText;
  }

  /**
   * Check if there's an app change between START and END periods.
   * Returns true if the process name changed.
   */
  private hasAppChange(events: InteractionContext[]): boolean {
    return events.some(
      (event) =>
        event.type === 'app_change' &&
        event.previousWindow?.processName !== event.activeWindow?.processName
    );
  }

  /**
   * Extract the app name from interaction events.
   * Looks for the most recent event with activeWindow info.
   */
  private extractAppName(events: InteractionContext[]): string {
    // Iterate backwards to find the most recent event with activeWindow
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.activeWindow?.processName) {
        return event.activeWindow.processName;
      }
    }
    return '';
  }

  /**
   * Safely delete a screenshot file
   */
  private deleteScreenshot(filepath: string): void {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        console.log(`[EventProcessor] Deleted screenshot: ${filepath}`);
      }
    } catch (error) {
      console.error(`[EventProcessor] Failed to delete screenshot ${filepath}:`, error);
    }
  }

  /**
   * Search for events using both vector similarity and FTS.
   */
  public async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<{ fts: StoredEvent[]; vector: StoredEvent[] }> {
    const { limit = 5, startTime, endTime, appName } = options;
    const filters: SearchFilters = { startTime, endTime, appName };

    console.log(`[Search] Query: "${query}" (Limit: ${limit}, Filters: ${JSON.stringify(filters)})`);

    // 1. Generate embedding for vector search
    const queryVector = await this.embeddingService.generateEmbedding(query);

    // 2. Vector search with filters
    const vectorResults = await this.storageService.searchVectorsWithFilters(queryVector, limit, filters);
    console.log(`[Search] Vector results: ${vectorResults.length}`);

    // 3. FTS search with filters
    const ftsResults = await this.storageService.searchFTSWithFilters(query, limit, filters);
    console.log(`[Search] FTS results: ${ftsResults.length}`);

    return { fts: ftsResults, vector: vectorResults };
  }

  /**
   * Get the storage service instance
   */
  public getStorageService(): StorageService {
    return this.storageService;
  }

  /**
   * Get the classifier service instance
   */
  public getClassifierService(): SemanticClassifierService | null {
    return this.classifierService;
  }
}
