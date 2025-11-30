import { Logger as NestLogger } from '@nestjs/common';

export class Logger extends NestLogger {
  private shouldWriteToDb: boolean;
  private appName: string;
  private allowedCollections?: string[];
  // Remove: private mongoConnection?: Connection;

  constructor(
    appName: string, 
    dbConfig?: { allowedCollections?: string[] }, 
    disableDb?: boolean
  ) {
    super(appName);
    this.appName = appName;
    this.shouldWriteToDb = process.env.LOG_DISABLE_DB !== 'true' && !disableDb;
    
    this.allowedCollections = dbConfig?.allowedCollections;
  }

  private canAccessCollection(collectionName: string): boolean {
    
    if (!this.allowedCollections || this.allowedCollections.length === 0) {
      return true;
    }
    return this.allowedCollections.includes(collectionName);
  }

  private async writeLogToDb(message: string, severity: string): Promise<void> {
    if (!this.shouldWriteToDb) {
      return;
    }

    if (!this.canAccessCollection('logs')) {
      console.warn(`[${this.appName}] Access denied to 'logs' collection. Allowed: [${this.allowedCollections?.join(', ') || 'all'}]`);
      return;
    }

    try {
      const mongoose = require('mongoose');
      
      // Find any active connection
      const connections = mongoose.connections || [];
      const activeConnection = connections.find((conn: any) => conn.readyState === 1);
      
      if (!activeConnection) {
        console.warn(`[${this.appName}] No active mongoose connection found, skipping DB log`);
        return;
      }

      const logEntry = {
        timestamp: new Date(),
        message,
        severity,
        app: this.appName,
        environment: process.env.NODE_ENV || 'development'
      };

      await activeConnection.collection('logs').insertOne(logEntry);
      console.log(`[${this.appName}] Log written to database successfully`);
    } catch (error) {
      console.error(`[${this.appName}] Failed to write log to database: ${error.message}`);
    }
  }

  error(message: string) {
    super.error(message);
    this.writeLogToDb(message, 'error').catch(() => {});
  }

  warn(message: string) {
    super.warn(message);
    this.writeLogToDb(message, 'warn').catch(() => {});
  }

  info(message: string) {
    super.log(message);
    this.writeLogToDb(message, 'log').catch(() => {});
  }

  debug(message: string) {
    super.debug(message);
    this.writeLogToDb(message, 'debug').catch(() => {});
  }
}