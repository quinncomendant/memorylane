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
    const { filepath, id, timestamp } = screenshot;
    
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
          this.startScreenshot = screenshot;
          this.startEvents = events;
          this.startOcrText = text;
        } else {
          const allEvents = [...this.startEvents, ...events];

          console.log(`[EventProcessor] START screenshot: ${this.startScreenshot.id}`);
          console.log(`[EventProcessor] END screenshot: ${screenshot.id}`);

          let summary = '';
          try {
            // Classification needs both screenshot files
            summary = await this.classifierService.classify({
              startScreenshot: this.startScreenshot,
              endScreenshot: screenshot,
              events: allEvents,
            });
            console.log(`[EventProcessor] Classification summary: ${summary}`);
          } catch (classificationError) {
            console.error('[EventProcessor] Classification failed:', classificationError);
            summary = 'Classification failed';
          }

          // 3. Store START screenshot's data (OCR + summary)
          // Embed summary for better semantic search, fall back to OCR if no summary
          const vector = await this.embeddingService.generateEmbedding(summary || this.startOcrText);
          const appName = this.extractAppName(allEvents);
          const storedEvent: StoredEvent = {
            id: this.startScreenshot.id,
            timestamp: this.startScreenshot.timestamp,
            text: this.startOcrText,
            summary,
            appName,
            vector
          };
          await this.storageService.addEvent(storedEvent);
          console.log(`[EventProcessor] Stored event for ${this.startScreenshot.id} (app: ${appName})`);

          // Delete START screenshot (classification done, no longer needed)
          this.deleteScreenshot(this.startScreenshot.filepath);

          // END becomes new START (keep its file for next classification)
          this.startScreenshot = screenshot;
          this.startEvents = events;
          this.startOcrText = text;
        }
      } else {
        // No classifier - store OCR only with empty summary, then delete
        const vector = await this.embeddingService.generateEmbedding(text);
        const appName = this.extractAppName(events);
        const storedEvent: StoredEvent = {
          id,
          timestamp,
          text,
          summary: '',
          appName,
          vector
        };
        await this.storageService.addEvent(storedEvent);
        console.log(`[EventProcessor] Stored event for ${id} (no classifier, app: ${appName})`);
        this.deleteScreenshot(filepath);
      }
      
    } catch (error) {
      console.error(`Error processing screenshot ${id}:`, error);
      throw error;
    }
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
}
