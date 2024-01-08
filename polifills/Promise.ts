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
            

            this.#onRejected.push(reason => {
                if (!cathCb) {
                    reject(reason);
                    return;
                }

                try {
                    resolve(cathCb(reason))
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
}


