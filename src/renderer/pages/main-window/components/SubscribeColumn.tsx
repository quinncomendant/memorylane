import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'

export function SubscribeColumn(): React.JSX.Element {
  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Subscribe</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <svg
              className="w-6 h-6 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-muted-foreground">Coming Soon</p>
          <p className="text-xs text-muted-foreground mt-1">
            Managed API access with usage-based pricing
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
