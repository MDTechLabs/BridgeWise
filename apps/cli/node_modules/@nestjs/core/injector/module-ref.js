"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModuleRef = void 0;
const common_1 = require("@nestjs/common");
const get_class_scope_1 = require("../helpers/get-class-scope");
const is_durable_1 = require("../helpers/is-durable");
const abstract_instance_resolver_1 = require("./abstract-instance-resolver");
const constants_1 = require("./constants");
const injector_1 = require("./injector");
const instance_links_host_1 = require("./instance-links-host");
const instance_wrapper_1 = require("./instance-wrapper");
class ModuleRef extends abstract_instance_resolver_1.AbstractInstanceResolver {
    get instanceLinksHost() {
        if (!this._instanceLinksHost) {
            this._instanceLinksHost = new instance_links_host_1.InstanceLinksHost(this.container);
        }
        return this._instanceLinksHost;
    }
    constructor(container) {
        super();
        this.container = container;
        const contextOptions = container.contextOptions;
        this.injector = new injector_1.Injector({
            preview: contextOptions?.preview ?? false,
            snapshot: contextOptions?.snapshot,
            instanceDecorator: contextOptions?.instrument?.instanceDecorator,
        });
    }
    introspect(token) {
        const { wrapperRef } = this.instanceLinksHost.get(token);
        let scope = common_1.Scope.DEFAULT;
        if (!wrapperRef.isDependencyTreeStatic()) {
            scope = common_1.Scope.REQUEST;
        }
        else if (wrapperRef.isTransient) {
            scope = common_1.Scope.TRANSIENT;
        }
        return { scope };
    }
    registerRequestByContextId(request, contextId) {
        this.container.registerRequestProvider(request, contextId);
    }
    async instantiateClass(type, moduleRef, contextId) {
        const wrapper = new instance_wrapper_1.InstanceWrapper({
            name: type && type.name,
            metatype: type,
            isResolved: false,
            scope: (0, get_class_scope_1.getClassScope)(type),
            durable: (0, is_durable_1.isDurable)(type),
            host: moduleRef,
        });
        if (type?.prototype) {
            wrapper.setInstanceByContextId(contextId ?? constants_1.STATIC_CONTEXT, {
                instance: Object.create(type.prototype),
                isResolved: false,
                isPending: false,
            });
        }
        return new Promise(async (resolve, reject) => {
            try {
                const callback = async (instances) => {
                    const properties = await this.injector.resolveProperties(wrapper, moduleRef, undefined, {
                        contextId: contextId ?? constants_1.STATIC_CONTEXT,
                        inquirer: wrapper,
                    });
                    const instance = new type(...instances);
                    this.injector.applyProperties(instance, properties);
                    resolve(instance);
                };
                await this.injector.resolveConstructorParams(wrapper, moduleRef, undefined, callback, {
                    contextId: contextId ?? constants_1.STATIC_CONTEXT,
                    inquirer: wrapper,
                });
            }
            catch (err) {
                reject(err);
            }
        });
    }
}
exports.ModuleRef = ModuleRef;
