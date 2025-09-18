#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

async function verifyInstallation() {
    console.log('🔍 Verifying Social Media Scraper API Installation...\n');

    let allGood = true;

    // Required files and directories
    const requiredStructure = {
        'src/': {
            'app.js': 'Main application file',
            'services/': {
                'scrapingService.js': 'Original scraping service',
                'realisticScrapingService.js': 'Enhanced credential-based scraping service'
            },
            'routes/': {
                'scraper.js': 'Scraping endpoints',
                'health.js': 'Health check endpoints'
            },
            'middleware/': {
                'validation.js': 'Request validation',
                'errorHandler.js': 'Error handling'
            },
            'config/': {
                'scraperConfigs.js': 'Platform configurations'
            },
            'utils/': {
                'logger.js': 'Logging utilities',
                'scraperUtils.js': 'Scraping utilities'
            }
        },
        'sessions/': 'Browser sessions storage (auto-created)',
        'logs/': 'Application logs (auto-created)',
        'tests/': {
            'basic.test.js': 'Basic test suite'
        },
        'scripts/': {
            'clean-sessions.js': 'Session cleanup script',
            'verify-installation.js': 'This verification script'
        },
        'package.json': 'Node.js dependencies and scripts',
        'swagger.config.js': 'Swagger documentation configuration',
        '.env.example': 'Environment variables template',
        '.npmrc': 'NPM configuration',
        'README.md': 'Project documentation',
        'LICENSE': 'License file'
    };

    // Check file structure
    await checkStructure(requiredStructure, '.');

    // Check environment setup
    console.log('📋 Environment Configuration:');
    await checkEnvironment();

    // Check dependencies
    console.log('\n📦 Dependencies:');
    await checkDependencies();

    // Check permissions
    console.log('\n🔐 Permissions:');
    await checkPermissions();

    // Summary
    console.log('\n' + '='.repeat(50));
    if (allGood) {
        console.log('✅ Installation verification PASSED');
        console.log('🚀 You can now run: npm run dev');
    } else {
        console.log('❌ Installation verification FAILED');
        console.log('🔧 Please fix the issues above before running the application');
    }

    async function checkStructure(structure, basePath, indent = '') {
        for (const [item, description] of Object.entries(structure)) {
            const fullPath = path.join(basePath, item);
            const isDirectory = item.endsWith('/');
            const displayName = isDirectory ? item.slice(0, -1) : item;

            try {
                const exists = await fs.pathExists(fullPath);

                if (exists) {
                    if (isDirectory) {
                        console.log(`${indent}📁 ${displayName}/`);
                        if (typeof description === 'object') {
                            await checkStructure(description, fullPath, indent + '  ');
                        }
                    } else {
                        const stats = await fs.stat(fullPath);
                        const size = stats.size > 1024 ? `${Math.round(stats.size/1024)}KB` : `${stats.size}B`;
                        console.log(`${indent}📄 ${displayName} (${size}) ✅`);
                    }
                } else {
                    if (description.includes('auto-created')) {
                        console.log(`${indent}📁 ${displayName}/ (will be auto-created) ⚠️`);
                        // Create the directory
                        await fs.ensureDir(fullPath);
                    } else {
                        console.log(`${indent}❌ ${displayName} - MISSING!`);
                        allGood = false;
                    }
                }
            } catch (error) {
                console.log(`${indent}❌ ${displayName} - ERROR: ${error.message}`);
                allGood = false;
            }
        }
    }

    async function checkEnvironment() {
        const envExample = path.join('.', '.env.example');
        const envFile = path.join('.', '.env');

        if (await fs.pathExists(envExample)) {
            console.log('  ✅ .env.example exists');
        } else {
            console.log('  ❌ .env.example missing');
            allGood = false;
        }

        if (await fs.pathExists(envFile)) {
            console.log('  ✅ .env file exists');

            // Check for required environment variables
            const envContent = await fs.readFile(envFile, 'utf8');
            const requiredVars = ['PORT', 'NODE_ENV', 'PUPPETEER_HEADLESS'];

            for (const varName of requiredVars) {
                if (envContent.includes(`${varName}=`)) {
                    console.log(`    ✅ ${varName} configured`);
                } else {
                    console.log(`    ⚠️  ${varName} not configured`);
                }
            }
        } else {
            console.log('  ⚠️  .env file not found (copy from .env.example)');
            console.log('    Run: cp .env.example .env');
        }
    }

    async function checkDependencies() {
        const packageJson = path.join('.', 'package.json');
        const nodeModules = path.join('.', 'node_modules');

        if (await fs.pathExists(packageJson)) {
            const pkg = await fs.readJson(packageJson);
            console.log(`  ✅ package.json (${Object.keys(pkg.dependencies || {}).length} dependencies)`);

            // Check for key dependencies
            const keyDeps = ['express', 'puppeteer', 'winston', 'joi'];
            for (const dep of keyDeps) {
                if (pkg.dependencies && pkg.dependencies[dep]) {
                    console.log(`    ✅ ${dep}: ${pkg.dependencies[dep]}`);
                } else {
                    console.log(`    ❌ ${dep}: missing`);
                    allGood = false;
                }
            }
        } else {
            console.log('  ❌ package.json missing');
            allGood = false;
        }

        if (await fs.pathExists(nodeModules)) {
            const modules = await fs.readdir(nodeModules);
            console.log(`  ✅ node_modules (${modules.length} modules installed)`);
        } else {
            console.log('  ❌ node_modules missing - run: npm install');
            allGood = false;
        }
    }

    async function checkPermissions() {
        const testDirs = ['./sessions', './logs'];

        for (const dir of testDirs) {
            try {
                await fs.ensureDir(dir);
                await fs.access(dir, fs.constants.W_OK);
                console.log(`  ✅ ${dir}/ writable`);
            } catch (error) {
                console.log(`  ❌ ${dir}/ not writable: ${error.message}`);
                allGood = false;
            }
        }

        // Test Chrome/Chromium availability
        try {
            const puppeteer = require('puppeteer');
            const executablePath = puppeteer.executablePath();
            console.log(`  ✅ Chrome/Chromium available at: ${executablePath}`);
        } catch (error) {
            console.log(`  ⚠️  Chrome/Chromium check failed: ${error.message}`);
            console.log('     This might work anyway if system Chrome is available');
        }
    }
}

// Additional helper functions
async function suggestFixes() {
    console.log('\n🔧 Suggested fixes:');
    console.log('');
    console.log('1. Install dependencies:');
    console.log('   npm install --legacy-peer-deps');
    console.log('');
    console.log('2. Create environment file:');
    console.log('   cp .env.example .env');
    console.log('');
    console.log('3. Create required directories:');
    console.log('   mkdir -p sessions logs tests');
    console.log('');
    console.log('4. Test the installation:');
    console.log('   npm test');
    console.log('');
    console.log('5. Start development server:');
    console.log('   npm run dev');
}

// Run verification
if (require.main === module) {
    verifyInstallation()
        .then(() => {
            console.log('\n📚 Next steps:');
            console.log('1. Edit .env file with your settings');
            console.log('2. Run: npm run dev');
            console.log('3. Visit: http://localhost:3000/api/docs');
            console.log('4. Test credentials: POST /api/scrape/test-credentials');
        })
        .catch(error => {
            console.error('❌ Verification failed:', error);
            suggestFixes();
            process.exit(1);
        });
}

module.exports = { verifyInstallation };