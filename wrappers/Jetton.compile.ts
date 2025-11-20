import { CompilerConfig, HookParams } from '@ton/blueprint';
import { Cell } from '@ton/core';

export const compile: CompilerConfig = {
    $schema: '',
    buildLibrary: false,
    options: {
        debug: false
    },
    projects: [],
    target: './contracts/jetton/jetton.tact',
    lang: 'tact',
};
