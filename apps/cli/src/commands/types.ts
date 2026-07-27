export interface CommandOption {
  name: string;
  alias?: string;
  description: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
  type?: 'string' | 'number' | 'boolean';
}

export interface CommandDefinition {
  name: string;
  description: string;
  usage: string;
  aliases?: string[];
  options?: CommandOption[];
}

export interface ParsedOptions {
  [key: string]: any;
}

export interface CommandResult<T = any> {
  success: boolean;
  command: string;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface CLICommand {
  readonly definition: CommandDefinition;
  execute(args: string[], options: ParsedOptions): Promise<CommandResult>;
}

export type OutputFormat = 'text' | 'json';

export function Injectable(): ClassDecorator {
  return (target: any) => target;
}
