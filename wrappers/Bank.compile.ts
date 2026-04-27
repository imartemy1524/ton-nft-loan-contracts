import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tolk',
    entrypoint: 'contracts/bank/bank.tolk',
    withStackComments: true,
    withSrcLineComments: true,
    experimentalOptions: '',
};
