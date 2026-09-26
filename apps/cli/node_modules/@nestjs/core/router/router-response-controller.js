"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouterResponseController = void 0;
const common_1 = require("@nestjs/common");
const shared_utils_1 = require("@nestjs/common/utils/shared.utils");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const sse_stream_1 = require("./sse-stream");
class RouterResponseController {
    constructor(applicationRef) {
        this.applicationRef = applicationRef;
        this.logger = new common_1.Logger(RouterResponseController.name);
    }
    async apply(result, response, httpStatusCode) {
        return this.applicationRef.reply(response, result, httpStatusCode);
    }
    async redirect(resultOrDeferred, response, redirectResponse) {
        const result = await this.transformToResult(resultOrDeferred);
        const statusCode = result && result.statusCode
            ? result.statusCode
            : redirectResponse.statusCode
                ? redirectResponse.statusCode
                : common_1.HttpStatus.FOUND;
        const url = result && result.url ? result.url : redirectResponse.url;
        this.applicationRef.redirect(response, statusCode, url);
    }
    async render(resultOrDeferred, response, template) {
        const result = await this.transformToResult(resultOrDeferred);
        return this.applicationRef.render(response, template, result);
    }
    async transformToResult(resultOrDeferred) {
        if ((0, rxjs_1.isObservable)(resultOrDeferred)) {
            return (0, rxjs_1.lastValueFrom)(resultOrDeferred);
        }
        return resultOrDeferred;
    }
    getStatusByMethod(requestMethod) {
        switch (requestMethod) {
            case common_1.RequestMethod.POST:
                return common_1.HttpStatus.CREATED;
            default:
                return common_1.HttpStatus.OK;
        }
    }
    setHeaders(response, headers) {
        headers.forEach(({ name, value }) => this.applicationRef.setHeader(response, name, typeof value === 'function' ? value() : value));
    }
    setStatus(response, statusCode) {
        this.applicationRef.status(response, statusCode);
    }
    async sse(result, response, request, options) {
        // It's possible that we sent headers already so don't use a stream
        if (response.writableEnded) {
            return;
        }
        const stream = new sse_stream_1.SseStream(request);
        const statusCode = options?.statusCode ??
            response.statusCode ??
            200;
        return new Promise((resolve, reject) => {
            let settled = false;
            let closeRequested = false;
            let subscription;
            const disconnectSource = request.socket ?? response;
            const cleanup = () => disconnectSource.removeListener('close', onClose);
            const endStream = () => {
                if (!stream.writableEnded) {
                    stream.end();
                }
            };
            const onClose = () => {
                if (settled || closeRequested) {
                    return;
                }
                closeRequested = true;
                if (!subscription) {
                    cleanup();
                    return;
                }
                settled = true;
                cleanup();
                subscription?.unsubscribe();
                endStream();
                response.end();
                resolve();
            };
            disconnectSource.once('close', onClose);
            Promise.resolve(result)
                .then(observableResult => {
                if (settled) {
                    return;
                }
                this.assertObservable(observableResult);
                if (closeRequested) {
                    const cleanupSubscription = observableResult.subscribe({
                        error: () => undefined,
                    });
                    cleanupSubscription.unsubscribe();
                    settled = true;
                    endStream();
                    response.end();
                    resolve();
                    return;
                }
                stream.pipe(response, {
                    additionalHeaders: options?.additionalHeaders,
                    statusCode,
                });
                subscription = observableResult
                    .pipe((0, operators_1.map)((message) => {
                    if ((0, shared_utils_1.isObject)(message)) {
                        return message;
                    }
                    return { data: message };
                }), (0, operators_1.concatMap)(message => new Promise(resolve => stream.writeMessage(message, () => resolve()))), (0, operators_1.catchError)(err => {
                    if (!stream.headersCommitted) {
                        throw err;
                    }
                    const data = err instanceof Error ? err.message : err;
                    stream.writeMessage({ type: 'error', data }, writeError => {
                        if (writeError) {
                            this.logger.error(writeError);
                        }
                    });
                    return rxjs_1.EMPTY;
                }))
                    .subscribe({
                    error: err => {
                        if (settled) {
                            return;
                        }
                        settled = true;
                        cleanup();
                        endStream();
                        reject(err);
                    },
                    complete: () => {
                        if (settled) {
                            return;
                        }
                        settled = true;
                        cleanup();
                        endStream();
                        resolve();
                    },
                });
                // Commit SSE headers on the next macrotask. Pipe validation errors
                // propagate through microtasks (which complete before macrotasks),
                // so if the lifecycle errored, `settled` is already true and we
                // skip the write. Otherwise headers are sent immediately rather
                // than waiting for the first Observable emission.
                setTimeout(() => {
                    if (!settled) {
                        stream.commitHeaders();
                    }
                }, 0);
            })
                .catch(err => {
                if (settled) {
                    return;
                }
                if (closeRequested) {
                    settled = true;
                    endStream();
                    response.end();
                    resolve();
                    return;
                }
                settled = true;
                cleanup();
                endStream();
                reject(err);
            });
        });
    }
    assertObservable(value) {
        if (!(0, rxjs_1.isObservable)(value)) {
            throw new ReferenceError('You must return an Observable stream to use Server-Sent Events (SSE).');
        }
    }
}
exports.RouterResponseController = RouterResponseController;
