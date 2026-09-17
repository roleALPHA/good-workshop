import type { ClientConfig } from 'pg'
export function dbOptions(connectionString: string, passwordFile?: string): ClientConfig
