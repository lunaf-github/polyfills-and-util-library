const AggregateError = require('aggregate-error')

type Resolve<T> = (value: T) => void;
type Reject<T> = (value: T) => void;
type FullfilledCb = (arg: any) => any;
type RejectedCb = (arg: any) => any

const STATE = {
    FULLFILLED: 'fullfilled',
    REJECTED: 'rejected',
    PENDING: 'pending'
}


class PolyPromise<T> {
    #value: T | Error | undefined;
    #status: string = STATE.PENDING;
    #onFullfilled: FullfilledCb[] = [];
    #onRejected: RejectedCb[] = [];

    #onResolveBound = this.#resolve.bind(this);
    #onRejectedBound = this.#reject.bind(this);


    constructor(cb: (resolve: Resolve<T>, reject: Reject<any>) => void) {
        try {
            cb(this.#onResolveBound, this.#onRejectedBound);
        } catch (error) {
            this.#reject(error);
        }
    }

    #resolve(value: T): void {
        queueMicrotask(() => {
            if (this.#status !== STATE.PENDING) return;

            if (value instanceof PolyPromise) {
                value.then(this.#onResolveBound, this.#onRejectedBound);
                return;
            }
    
            this.#status = STATE.FULLFILLED;
            this.#value = value;
    
            this.#runCallbacks();
        });
    }   

    #reject(reason: any): void {
        queueMicrotask(() => {
            if (this.#status !== STATE.PENDING) return;

            if (reason instanceof PolyPromise) {
                reason.then(this.#onResolveBound, this.#onRejectedBound);
                return;
            }

            if (this.#onRejected.length === 0) {
                throw Error('Uncaught Promise Error');
            }
    
            this.#status = STATE.REJECTED;
            this.#value = reason;
    
            this.#runCallbacks();
        });
    }

    #runCallbacks(): void {
        if (this.#status === STATE.FULLFILLED) {
            this.#onFullfilled.forEach(cb => cb(this.#value));
            this.#onFullfilled = [];
        }

        if (this.#status === STATE.REJECTED) {
            this.#onRejected.forEach(cb => cb(this.#value));
            this.#onRejected = [];
        }
    }

    then(thenCb?: FullfilledCb | undefined, cathCb?: RejectedCb | undefined) {
        return new PolyPromise((resolve, reject) => {
            
            this.#onFullfilled.push(result => {
                if (!thenCb) {
                    resolve(result);
                    return;
                }

                try {
                    resolve(thenCb(result))
                } catch(error) {
                    reject(error)
                }                
            });
            

            this.#onRejected.push(result => {
                if (!cathCb) {
                    reject(result);
                    return;
                }

                try {
                    resolve(cathCb(result))
                } catch(error) {
                    reject(error)
                }
            });

            this.#runCallbacks();
        });
    }

    catch(catchCb: RejectedCb) {
        return this.then(undefined, catchCb);
    }

    finally(cb: () => void) {
        return this.then(thenCb, catchCb);

        function thenCb(result) {
            cb();
            return result;
        }

        function catchCb(reason) {
            cb();
            return reason;
        }
    }

    // Returns a Promise that automatically resolves value, good for converting non promises into promises
    static resolve(value: any) {
        return new PolyPromise(resolve => resolve(value));
    }

    // Returns a Promise that automatically rejects value, used for debugging
    static reject(reason: any) {
        return new PolyPromise((resolve, reject) => reject(reason));
    }

    // Accepts an array of promises and returns a Promise that gets resolved by the promise that gets resolved first, if all 
    // are rejected it will return an aggregatedError. 
    static any(promises: PolyPromise<any>[]) {
        const errors: Error[] = [];
        let rejectedPromises = 0;

        return new PolyPromise((resolve, reject) => {
            for (let i = 0; i < promises.length; i++) {
                promises[i] 
                    .then(resolve)
                    .catch(reason => {
                        errors[i] = reason;
                        rejectedPromises++;

                        if (rejectedPromises === promises.length) {
                            reject(new AggregateError(errors, 'All promises were rejected'));
                        }
                    })
            }
        });
    }

    // Accepts an array of promies and returns a Promise that sesolves when all promises are resolved, the resolved value is an array of the 
    // resolved values of each promise inside the array of promises. If any of the promises inside the array fails, the promise will be rejected
    static all(promises: PolyPromise<any>[]) {
        const resolvedValues: any[] = [];
        let resolvedPromises = 0;

        return new PolyPromise((resolve, reject) => {
            promises.forEach((promise, i) => {
                promise
                    .then(result => {
                        resolvedPromises[i] = result;
                        resolvedPromises++;

                        if (resolvedPromises === promises.length) {
                            resolve(resolvedValues);
                        }
                    })
                    .catch(reject)
            });
        });
    }
    
    // Accepts an array of promises and returns a Promise that resolves when all promises are settled. 
    static allSettled(promises: PolyPromise<any>[]) {

        return new PolyPromise(resolve => {
            const values: any[] = [];
            let settledPromises = 0;
    
            promises.forEach((promise, i) => {
                promise
                    .then(value => {
                        values[i] = {status: STATE.FULLFILLED, value};
                    })
                    .catch(reason => {
                        values[i] = {status: STATE.REJECTED, reason};
                    })
                    .finally(() => {
                        settledPromises++;
                        if (settledPromises === promises.length) resolve(values);
                    })
            });
        });
    }

    //  Accepts an array of promises and returns a Promise that settles when first promise is settled
    static race(promises: PolyPromise<any>[]) {
        return new PolyPromise((resolve, reject) => {
            promises.forEach(promise => promise.then(resolve).catch(reject));
        }); 
    }
}


