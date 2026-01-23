export interface BridgeProvider {
    name: string;
    apiUrl: string;
}
export interface ApiRequest {
    provider: BridgeProvider;
    payload: unknown;
}
export interface ApiResponse {
    success: boolean;
    data?: unknown;
    error?: ApiError;
}
export interface ApiError {
    isTransient: boolean;
    message: string;
    details?: unknown;
}
