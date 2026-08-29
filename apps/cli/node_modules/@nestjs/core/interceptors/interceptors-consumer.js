"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterceptorsConsumer = void 0;
const shared_utils_1 = require("@nestjs/common/utils/shared.utils");
const async_hooks_1 = require("async_hooks");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const execution_context_host_1 = require("../helpers/execution-context-host");
class InterceptorsConsumer {
    async intercept(interceptors, args, instance, callback, next, type) {
        if ((0, shared_utils_1.isEmpty)(interceptors)) {
            return next();
        }
        const context = this.createContext(args, instance, callback);
        context.setType(type);
        const nextFn = async (i = 0) => {
            if (i >= interceptors.length) {
                return (0, rxjs_1.defer)(async_hooks_1.AsyncResource.bind(() => this.transformDeferred(next)));
            }
            const handler = {
                handle: () => (0, rxjs_1.defer)(async_hooks_1.AsyncResource.bind(() => nextFn(i + 1))).pipe((0, operators_1.mergeAll)()),
            };
            return interceptors[i].intercept(context, handler);
        };
        return (0, rxjs_1.defer)(() => nextFn()).pipe((0, operators_1.mergeAll)());
    }
    createContext(args, instance, callback) {
        return new execution_context_host_1.ExecutionContextHost(args, instance.constructor, callback);
    }
    transformDeferred(next) {
        // Call next() eagerly here — this method is invoked inside
        // defer(AsyncResource.bind(...)), so the async context (e.g. AsyncLocalStorage)
        // is correctly inherited. Deferring next() into the subscriber function would
        // lose that context because the subscriber is called outside the bound scope.
        const nextPromise = next();
        return new rxjs_1.Observable(subscriber => {
            let innerSub;
            nextPromise
                .then(res => {
                if (subscriber.closed) {
                    // The outer subscription was torn down (e.g. an SSE client disconnect)
                    // before the async handler resolved. Subscribe-and-immediately-unsubscribe
                    // so the producer Observable's teardown/cleanup logic still runs.
                    if (res instanceof rxjs_1.Observable) {
                        const sub = res.subscribe({ error: () => { } });
                        sub.unsubscribe();
                    }
                    return;
                }
                const isDeferred = res instanceof Promise || res instanceof rxjs_1.Observable;
                innerSub = (0, rxjs_1.from)(isDeferred ? res : Promise.resolve(res)).subscribe(subscriber);
            })
                .catch(err => {
                if (!subscriber.closed) {
                    subscriber.error(err);
                }
            });
            return () => {
                innerSub?.unsubscribe();
            };
        });
    }
}
exports.InterceptorsConsumer = InterceptorsConsumer;
