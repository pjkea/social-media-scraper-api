// src/services/analysisService.js
const axios = require('axios');
const logger = require('../utils/logger');

class SocialMediaAnalysisService {
    constructor(pythonServiceUrl = 'http://localhost:5000') {
        this.pythonServiceUrl = pythonServiceUrl;
        this.isEnabled = process.env.ANALYSIS_ENABLED === 'true';
        this.geminiApiKey = process.env.GEMINI_API_KEY;

        if (this.isEnabled && !this.geminiApiKey) {
            logger.warn('Analysis service enabled but GEMINI_API_KEY not configured');
            this.isEnabled = false;
        }
    }

    /**
     * Analyze scraped social media data
     * @param {Object} scrapedData - The response from scraping service
     * @param {string} candidateName - Name of the candidate being analyzed
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Analysis results
     */
    async analyzeSocialMediaData(scrapedData, candidateName = 'Unknown Candidate', options = {}) {
        if (!this.isEnabled) {
            logger.info('Analysis service disabled, skipping analysis');
            return {
                analysis_performed: false,
                reason: 'Analysis service disabled',
                scraper_data: scrapedData
            };
        }

        try {
            logger.info(`Starting analysis for candidate: ${candidateName}`);

            // Prepare analysis request
            const analysisRequest = {
                scraper_json: scrapedData,
                candidate_name: candidateName,
                options: {
                    include_individual_posts: options.includeIndividualPosts !== false,
                    confidence_threshold: options.confidenceThreshold || 0.6,
                    analysis_depth: options.analysisDepth || 'standard' // standard, detailed, comprehensive
                }
            };

            // Call Python analysis service
            const response = await axios.post(
                `${this.pythonServiceUrl}/analyze`,
                analysisRequest,
                {
                    timeout: 60000, // 60 second timeout
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': this.geminiApiKey
                    }
                }
            );

            const analysisResults = response.data;

            // Add metadata
            analysisResults.analysis_metadata = {
                service_version: '1.0.0',
                analysis_timestamp: new Date().toISOString(),
                processing_time_ms: response.headers['x-processing-time'] || 'unknown',
                analysis_performed: true
            };

            logger.info(`Analysis completed for ${candidateName}, risk level: ${analysisResults.analysis_summary?.risk_level}`);

            return analysisResults;

        } catch (error) {
            logger.error('Analysis service error:', error.message);

            // Return scraper data with error info if analysis fails
            return {
                analysis_performed: false,
                error: error.message,
                scraper_data: scrapedData,
                analysis_metadata: {
                    service_version: '1.0.0',
                    analysis_timestamp: new Date().toISOString(),
                    error_occurred: true
                }
            };
        }
    }

    /**
     * Perform basic keyword-based analysis as fallback
     * @param {Object} scrapedData - The scraped social media data
     * @param {string} candidateName - Name of the candidate
     * @returns {Object} Basic analysis results
     */
    performBasicAnalysis(scrapedData, candidateName) {
        const posts = scrapedData.data?.posts || [];
        let riskScore = 0;
        const redFlags = [];
        const analysisResults = [];

        // Basic keyword analysis
        const riskKeywords = {
            high: ['hate', 'kill', 'die', 'stupid', 'idiot', 'moron', 'pathetic'],
            moderate: ['angry', 'disgusting', 'terrible', 'awful', 'worst'],
            low: ['annoyed', 'frustrated', 'disappointed']
        };

        posts.forEach((post, index) => {
            const text = (post.text || '').toLowerCase();
            let postRisk = 0;
            const postFlags = [];

            // Check for risk keywords
            Object.entries(riskKeywords).forEach(([level, keywords]) => {
                keywords.forEach(keyword => {
                    if (text.includes(keyword)) {
                        const score = level === 'high' ? 3 : level === 'moderate' ? 2 : 1;
                        postRisk += score;
                        postFlags.push(`${level} risk keyword: ${keyword}`);
                    }
                });
            });

            // Check for personal attacks (@ mentions with negative context)
            if (text.includes('@') && riskKeywords.high.some(word => text.includes(word))) {
                postRisk += 2;
                postFlags.push('Potential personal attack detected');
            }

            riskScore += postRisk;
            if (postFlags.length > 0) {
                redFlags.push(...postFlags);
            }

            analysisResults.push({
                content_id: `post_${index}`,
                risk_level: postRisk >= 3 ? 'high' : postRisk >= 2 ? 'moderate' : 'low',
                confidence: 0.3, // Low confidence for basic analysis
                red_flags: postFlags
            });
        });

        // Calculate overall risk level
        const avgRisk = posts.length > 0 ? riskScore / posts.length : 0;
        const overallRisk = avgRisk >= 2.5 ? 'high' : avgRisk >= 1.5 ? 'moderate' : 'low';

        return {
            analysis_performed: true,
            analysis_type: 'basic_fallback',
            candidate: candidateName,
            analysis_summary: {
                overall_score: Math.min(100, avgRisk * 20),
                risk_level: overallRisk,
                posts_analyzed: posts.length,
                recommendation: avgRisk >= 2.5 ? 'PROCEED_WITH_CAUTION' : 'APPROVED'
            },
            basic_findings: {
                total_red_flags: redFlags.length,
                risk_score: riskScore,
                average_risk_per_post: avgRisk
            },
            individual_posts: analysisResults,
            recommendations: {
                hiring_decision: avgRisk >= 2.5 ? 'PROCEED_WITH_CAUTION' : 'APPROVED',
                suggested_actions: avgRisk >= 2.5 ?
                    ['Additional behavioral interviews', 'Extended probationary period'] :
                    ['Standard hiring process']
            },
            metadata: {
                analysis_timestamp: new Date().toISOString(),
                analysis_method: 'keyword_based_fallback'
            }
        };
    }

    /**
     * Health check for analysis service
     */
    async healthCheck() {
        if (!this.isEnabled) {
            return { status: 'disabled', available: false };
        }

        try {
            const response = await axios.get(`${this.pythonServiceUrl}/health`, { timeout: 5000 });
            return {
                status: 'healthy',
                available: true,
                python_service: response.data
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                available: false,
                error: error.message
            };
        }
    }
}

module.exports = SocialMediaAnalysisService;

// -------------------------------------------------------------------

