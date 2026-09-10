import type { SuiCodegenConfig } from '@mysten/codegen';

const config: SuiCodegenConfig = {
  output: './src/generated',
  generateSummaries: true,
  prune: true,
  packages: [
    {
      package: '@local-pkg/anker-protocol',
      path: './contracts/anker_protocol',
    },
  ],
};

export default config;
