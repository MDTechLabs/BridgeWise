declare module 'opossum' {
  class CircuitBreaker {
    constructor(fn: (args: any) => Promise<any>, options?: any);
    fire(args: any): Promise<any>;
    on(event: string, callback: (result?: any) => void): void;
  }
  export = CircuitBreaker;
}
