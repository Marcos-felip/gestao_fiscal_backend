const fs = require('node:fs');
const path = require('node:path');

const ENV_KEY = 'FRONTEND_COPILOT_INSTRUCTIONS_PATH';
const rootDir = path.resolve(__dirname, '..');
const envFilePath = path.join(rootDir, '.env');
const instructionsFilePath = path.join(
  rootDir,
  '.github',
  'copilot-instructions.md',
);

function parseEnv(content) {
  return content.split(/\r?\n/).reduce((acc, rawLine) => {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      return acc;
    }

    const normalizedLine = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line;
    const separatorIndex = normalizedLine.indexOf('=');

    if (separatorIndex === -1) {
      return acc;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    let value = normalizedLine.slice(separatorIndex + 1).trim();

    if (!key) {
      return acc;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const commentIndex = value.indexOf(' #');
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    acc[key] = value;
    return acc;
  }, {});
}

function getFrontendInstructionsPath() {
  if (!fs.existsSync(envFilePath)) {
    throw new Error(
      `Arquivo .env não encontrado em ${envFilePath}. Crie-o a partir do .env.example.`,
    );
  }

  const envValues = parseEnv(fs.readFileSync(envFilePath, 'utf8'));
  const frontendPath = envValues[ENV_KEY];

  if (!frontendPath) {
    throw new Error(
      `Variável ${ENV_KEY} não encontrada no .env. Defina o caminho do copilot-instructions do frontend.`,
    );
  }

  return frontendPath;
}

function syncFrontendReference(frontendPath) {
  if (!fs.existsSync(instructionsFilePath)) {
    throw new Error(`Arquivo não encontrado: ${instructionsFilePath}`);
  }

  const originalContent = fs.readFileSync(instructionsFilePath, 'utf8');
  const frontendLineRegex = /^(\s*-\s*Frontend:\s*)`[^`]*`(\s*)$/m;

  if (!frontendLineRegex.test(originalContent)) {
    throw new Error(
      'Linha "Frontend:" não encontrada em .github/copilot-instructions.md.',
    );
  }

  const updatedContent = originalContent.replace(
    frontendLineRegex,
    (_, prefix, suffix) => `${prefix}\`${frontendPath}\`${suffix}`,
  );

  if (updatedContent === originalContent) {
    console.log('Nenhuma alteração necessária em .github/copilot-instructions.md.');
    return;
  }

  fs.writeFileSync(instructionsFilePath, updatedContent, 'utf8');
  console.log('Arquivo .github/copilot-instructions.md atualizado com sucesso.');
}

try {
  const frontendPath = getFrontendInstructionsPath();
  syncFrontendReference(frontendPath);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
