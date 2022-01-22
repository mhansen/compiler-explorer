import fs from 'fs';
import path from 'path';

import { TypicalExecutionFunc, UnprocessedExecResult } from '../../types/execution/execution.interfaces';
import { IParseFilters } from '../../types/features/filters.interfaces';
import { maskRootdir } from '../utils';

import { IExternalParser, IParsedAsmResult } from './external-parser.interface';

const starterScriptName = 'dump-and-parse.sh';

export class ExternalParserBase implements IExternalParser {
    private objdumperPath: string;
    private parserPath: string;
    private execFunc: TypicalExecutionFunc;
    private compilerInfo;
    private envInfo;

    constructor(compilerInfo, envInfo, execFunc: TypicalExecutionFunc) {
        this.compilerInfo = compilerInfo;
        this.envInfo = envInfo;
        this.objdumperPath = compilerInfo.objdumper;
        this.parserPath = compilerInfo.externalparser.props('exe', '');
        this.execFunc = execFunc;
    }

    private getParserArguments(filters: IParseFilters, fromStdin: boolean): string[] {
        const parameters = [];

        if (fromStdin) parameters.push('-stdin');
        if (filters.binary) parameters.push('-binary');
        if (filters.labels) parameters.push('-unused_labels');
        if (filters.directives) parameters.push('-directives');
        if (filters.commentOnly) parameters.push('-comment_only');
        if (filters.trim) parameters.push('-whitespace');
        if (filters.libraryCode) parameters.push('-library_functions');

        return parameters;
    }

    private getObjdumpStarterScriptContent(filters: IParseFilters) {
        const parserArgs = this.getParserArguments(filters, true);

        return '#!/bin/bash\n' +
            `OBJDUMP=${this.objdumperPath}\n` +
            `ASMPARSER=${this.parserPath}\n` +
            `$OBJDUMP "$@" | $ASMPARSER ${parserArgs.join(' ')}\n`;
    }

    private async writeStarterScriptObjdump(buildfolder: string, filters: IParseFilters): Promise<string> {
        const scriptFilepath = path.join(buildfolder, starterScriptName);

        return new Promise((resolve) => {
            fs.writeFile(scriptFilepath,
                this.getObjdumpStarterScriptContent(filters), {
                encoding: 'utf8',
                mode: 0o777,
            }, () => {
                resolve(maskRootdir(scriptFilepath));
            });
        });
    }

    private parseAsmExecResult(execResult: UnprocessedExecResult): IParsedAsmResult {
        const result = Object.assign({}, execResult, JSON.parse(execResult.stdout));
        delete result.stdout;
        delete result.stderr;
        return result;
    }

    public async objdumpAndParseAssembly(buildfolder: string, objdumpArgs: string[],
        filters: IParseFilters): Promise<IParsedAsmResult> {
        objdumpArgs = objdumpArgs.map((v) => {
            return maskRootdir(v);
        });
        await this.writeStarterScriptObjdump(buildfolder, filters);
        const execOptions = {
            env: this.envInfo.getEnv(this.compilerInfo.needsMulti),
            customCwd: buildfolder,
        };
        const execResult = await this.execFunc('./' + starterScriptName, objdumpArgs, execOptions);
        return this.parseAsmExecResult(execResult);
    }

    public async parseAssembly(filepath: string, filters: IParseFilters): Promise<IParsedAsmResult>  {
        const execOptions = {
            env: this.envInfo.getEnv(this.compilerInfo.needsMulti),
        };

        const parserArgs = this.getParserArguments(filters, false);
        parserArgs.push(filepath);

        const execResult = await this.execFunc(this.parserPath, parserArgs, execOptions);
        return this.parseAsmExecResult(execResult);
    }
}
