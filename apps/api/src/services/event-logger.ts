// ─── Audit Event Logger ───
// Logs all security-sensitive events per PRD Section 21
// Never logs API secrets, passwords, or full payment credentials

import { v4 as uuidv4 } from 'uuid';
import { SecurityEvent } from '../types';

class EventLogger {
  private events: SecurityEvent[] = [];

  log(event: Omit<SecurityEvent, 'id' | 'timestamp'>): SecurityEvent {
    const fullEvent: SecurityEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...event,
    };
    this.events.push(fullEvent);
    // Structured JSON log to console
    console.log(JSON.stringify({
      level: this.severityToLevel(fullEvent.severity),
      type: 'security_event',
      event: {
        id: fullEvent.id,
        sessionId: fullEvent.sessionId,
        type: fullEvent.type,
        severity: fullEvent.severity,
        message: fullEvent.message,
        intentId: fullEvent.intentId,
        transactionId: fullEvent.transactionId,
        latencyMs: fullEvent.latencyMs,
      },
      timestamp: fullEvent.timestamp,
    }));
    return fullEvent;
  }

  getEvents(sessionId?: string): SecurityEvent[] {
    if (sessionId) {
      return this.events.filter(e => e.sessionId === sessionId);
    }
    return [...this.events];
  }

  getEventsByType(type: SecurityEvent['type'], sessionId?: string): SecurityEvent[] {
    return this.getEvents(sessionId).filter(e => e.type === type);
  }

  reset(): void {
    this.events = [];
  }

  private severityToLevel(severity: SecurityEvent['severity']): string {
    switch (severity) {
      case 'critical': return 'ERROR';
      case 'high': return 'WARN';
      case 'medium': return 'WARN';
      case 'low': return 'INFO';
      case 'info': return 'INFO';
      default: return 'INFO';
    }
  }
}

// Singleton instance
export const eventLogger = new EventLogger();
