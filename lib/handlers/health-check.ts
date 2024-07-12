// Copyright (c) 2017, Compiler Explorer Authors
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

import express from 'express';
import fs from 'fs-extra';

import {CompilationQueue} from '../compilation-queue.js';
import {logger} from '../logger.js';
import {SentryCapture} from '../sentry.js';

import {ICompileHandler} from './compile.interfaces.js';

export class HealthCheckHandler {
    public readonly handle: (req: any, res: any) => Promise<void>;

    constructor(
        private readonly compilationQueue: CompilationQueue,
        private readonly filePath: any,
        private readonly compileHandler: ICompileHandler,
        private readonly isExecutionWorker: boolean,
    ) {
        this.handle = this._handle.bind(this);
    }

    async _handle(req: express.Request, res: express.Response) {
        /* wait on an empty job to pass through the compilation queue
         * to ensure the health check will timeout if it is deadlocked
         * we set the priority to super high here and rely on the fact
         * that timed out jobs will auto-cancel. this health check then
         * is just testing that _something_ is still processing jobs in
         * the async queue.
         *
         * we perform the remainder of the health check outside of the
         * job to minimize the duration that we hold an execution slot
         */
        await this.compilationQueue.enqueue(async () => {}, {highPriority: true});

        if (!this.isExecutionWorker && !this.compileHandler.hasLanguages()) {
            logger.error(`*** HEALTH CHECK FAILURE: no languages/compilers detected`);
            res.status(500).end();
            return;
        }

        if (!this.filePath) {
            res.send('Everything is awesome');
            return;
        }

        try {
            const content = await fs.readFile(this.filePath);
            if (content.length === 0) throw new Error('File is empty');
            res.set('Content-Type', 'text/html');
            res.send(content);
        } catch (e) {
            logger.error(`*** HEALTH CHECK FAILURE: while reading file '${this.filePath}' got ${e}`);
            SentryCapture(e, 'Health check');
            res.status(500).end();
        }
    }
}
