const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const buildInfoDir = path.join(rootDir, 'artifacts', 'build-info');

if (!fs.existsSync(buildInfoDir)) {
  console.error(`Build info directory not found: ${buildInfoDir}`);
  process.exit(1);
}

// 1. Set up symlinks for Hardhat 3 path prefixes (project/ and npm/)
const projectLink = path.join(rootDir, 'project');
if (!fs.existsSync(projectLink)) {
  try {
    fs.symlinkSync(rootDir, projectLink, process.platform === 'win32' ? 'junction' : 'dir');
    console.log('Created project link');
  } catch (err) {
    console.warn('Could not create project link:', err.message);
  }
}

const npmOpenzeppelinDir = path.join(rootDir, 'npm', '@openzeppelin');
fs.mkdirSync(npmOpenzeppelinDir, { recursive: true });

const ozDir = path.join(rootDir, 'node_modules', '@openzeppelin');
if (fs.existsSync(ozDir)) {
  for (const pkg of fs.readdirSync(ozDir)) {
    const pkgPath = path.join(ozDir, pkg);
    const pkgJsonPath = path.join(pkgPath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const linkName = `${pkg}@${pkgJson.version}`;
        const dest = path.join(npmOpenzeppelinDir, linkName);
        if (!fs.existsSync(dest)) {
          fs.symlinkSync(pkgPath, dest, process.platform === 'win32' ? 'junction' : 'dir');
          console.log(`Created symlink for ${linkName}`);
        }
      } catch (err) {
        console.warn(`Could not create link for ${pkg}:`, err.message);
      }
    }
  }
}

// 2. Merge Hardhat 3 split build-info files into Hardhat 2 format expected by crytic-compile
const files = fs.readdirSync(buildInfoDir);
for (const file of files) {
  if (file.endsWith('.output.json')) {
    const baseName = file.replace('.output.json', '.json');
    const basePath = path.join(buildInfoDir, baseName);
    const outPath = path.join(buildInfoDir, file);

    if (fs.existsSync(basePath)) {
      const baseJson = JSON.parse(fs.readFileSync(basePath, 'utf8'));
      const outJson = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      baseJson.output = outJson.output;
      if (!baseJson.input.settings.optimizer) {
        baseJson.input.settings.optimizer = { enabled: false };
      }
      fs.writeFileSync(basePath, JSON.stringify(baseJson));
      fs.unlinkSync(outPath);
      console.log(`Merged ${file} into ${baseName} for Slither compatibility.`);
    }
  }
}
