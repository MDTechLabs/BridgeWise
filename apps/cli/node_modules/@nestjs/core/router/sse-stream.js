"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SseStream = void 0;
const shared_utils_1 = require("@nestjs/common/utils/shared.utils");
const stream_1 = require("stream");
function toDataString(data) {
    if ((0, shared_utils_1.isObject)(data)) {
        return toDataString(JSON.stringify(data));
    }
    return data
        .split(/\r\n|\r|\n/)
        .map(line => `data: ${line}\n`)
        .join('');
}
/**
 * Adapted from https://raw.githubusercontent.com/EventSource/node-ssestream
 * Transforms "messages" to W3C event stream content.
 * See https://html.spec.whatwg.org/multipage/server-sent-events.html
 * A message is an object with one or more of the following properties:
 * - data (String or object, which gets turned into JSON)
 * - type
 * - id
 * - retry
 *
 * If constructed with a HTTP Request, it will optimise the socket for streaming.
 * If this stream is piped to an HTTP Response, it will set appropriate headers.
 */
class SseStream extends stream_1.Transform {
    constructor(req) {
        super({ objectMode: true });
        this.lastEventId = null;
        this._headersCommitted = false;
        this._destination = null;
        this._statusCode = 200;
        if (req && req.socket) {
            req.socket.setKeepAlive(true);
            req.socket.setNoDelay(true);
            req.socket.setTimeout(0);
        }
    }
    get headersCommitted() {
        return this._headersCommitted;
    }
    pipe(destination, options) {
        this._destination = destination;
        this._statusCode = options?.statusCode ?? 200;
        this._additionalHeaders = options?.additionalHeaders;
        return super.pipe(destination, options);
    }
    /**
     * Writes SSE headers to the destination if they have not been sent yet.
     * Headers are deferred until the first message so that, if the observable
     * errors before any data is emitted, the HTTP status code can still be
     * changed by an exception filter.
     */
    commitHeaders() {
        if (this._headersCommitted || !this._destination) {
            return;
        }
        if (this._destination.writableEnded) {
            return;
        }
        this._headersCommitted = true;
        const statusCode = this._statusCode ?? 200;
        const additionalHeaders = this._additionalHeaders;
        if (this._destination.writeHead) {
            this._destination.writeHead(statusCode, {
                ...additionalHeaders,
                // See https://github.com/dunglas/mercure/blob/master/hub/subscribe.go#L124-L130
                'Content-Type': 'text/event-stream',
                Connection: 'keep-alive',
                // Disable cache, even for old browsers and proxies
                'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
                Pragma: 'no-cache',
                Expire: '0',
                // NGINX support https://www.nginx.com/resources/wiki/start/topics/examples/x-accel/#x-accel-buffering
                'X-Accel-Buffering': 'no',
            });
            this._destination.flushHeaders?.();
        }
        this._destination.write('\n');
    }
    _transform(message, encoding, callback) {
        this.commitHeaders();
        const sanitize = (val) => String(val).replace(/[\r\n]/g, '');
        let data = message.type ? `event: ${sanitize(message.type)}\n` : '';
        data +=
            message.id !== undefined && message.id !== null
                ? `id: ${sanitize(message.id)}\n`
                : '';
        data += message.retry ? `retry: ${sanitize(message.retry)}\n` : '';
        data += message.data ? toDataString(message.data) : '';
        data += '\n';
        this.push(data);
        callback();
    }
    /**
     * Calls `.write` but handles the drain if needed
     */
    writeMessage(message, cb) {
        if (message.id === undefined || message.id === null) {
            this.lastEventId++;
            message.id = this.lastEventId.toString();
        }
        if (!this.write(message, 'utf-8')) {
            this.once('drain', cb);
        }
        else {
            process.nextTick(cb);
        }
    }
}
exports.SseStream = SseStream;
