#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

async function cleanSessions(olderThanDays = 30) {
    const sessionsDir = path.join(__dirname, '../sessions');

    if (!await fs.pathExists(sessionsDir)) {
        console.log('❌ Sessions directory does not exist');
        return;
    }

    const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));

    try {
        const sessionDirs = await fs.readdir(sessionsDir);
        let deletedCount = 0;
        let totalFreedBytes = 0;

        console.log(`🧹 Cleaning sessions older than ${olderThanDays} days (before ${cutoffDate.toISOString().split('T')[0]})`);
        console.log(`📁 Found ${sessionDirs.length} session directories`);

        for (const sessionDir of sessionDirs) {
            const sessionPath = path.join(sessionsDir, sessionDir);
            const sessionInfoPath = path.join(sessionPath, 'session_info.json');

            try {
                if (await fs.pathExists(sessionInfoPath)) {
                    const sessionInfo = await fs.readJson(sessionInfoPath);
                    const lastLogin = new Date(sessionInfo.lastLogin);

                    if (lastLogin < cutoffDate) {
                        // Calculate size before deletion
                        const size = await getDirectorySize(sessionPath);
                        await fs.remove(sessionPath);

                        deletedCount++;
                        totalFreedBytes += size;

                        console.log(`🗑️  Deleted: ${sessionDir} (${sessionInfo.platform}) - Last login: ${lastLogin.toISOString().split('T')[0]}`);
                    } else {
                        console.log(`✅ Keeping: ${sessionDir} (${sessionInfo.platform}) - Last login: ${lastLogin.toISOString().split('T')[0]}`);
                    }
                } else {
                    // Delete sessions without info file (corrupted)
                    const size = await getDirectorySize(sessionPath);
                    await fs.remove(sessionPath);

                    deletedCount++;
                    totalFreedBytes += size;

                    console.log(`🗑️  Deleted corrupted session: ${sessionDir}`);
                }
            } catch (error) {
                console.log(`⚠️  Error processing ${sessionDir}: ${error.message}`);
            }
        }

        console.log('\n📊 Cleanup Summary:');
        console.log(`   Deleted sessions: ${deletedCount}`);
        console.log(`   Freed space: ${formatBytes(totalFreedBytes)}`);
        console.log(`   Remaining sessions: ${sessionDirs.length - deletedCount}`);

    } catch (error) {
        console.error('❌ Error during cleanup:', error.message);
        process.exit(1);
    }
}

async function getDirectorySize(dirPath) {
    try {
        let totalSize = 0;
        const files = await fs.readdir(dirPath, { withFileTypes: true });

        for (const file of files) {
            const fullPath = path.join(dirPath, file.name);
            if (file.isDirectory()) {
                totalSize += await getDirectorySize(fullPath);
            } else {
                const stats = await fs.stat(fullPath);
                totalSize += stats.size;
            }
        }

        return totalSize;
    } catch (error) {
        return 0;
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Parse command line arguments
const args = process.argv.slice(2);
const olderThanDays = args[0] ? parseInt(args[0]) : 30;

if (isNaN(olderThanDays) || olderThanDays < 1) {
    console.error('❌ Please provide a valid number of days (minimum 1)');
    console.log('Usage: node scripts/clean-sessions.js [days]');
    console.log('Example: node scripts/clean-sessions.js 7  # Clean sessions older than 7 days');
    process.exit(1);
}

// Run the cleanup
cleanSessions(olderThanDays).then(() => {
    console.log('✅ Session cleanup completed');
}).catch(error => {
    console.error('❌ Session cleanup failed:', error);
    process.exit(1);
});