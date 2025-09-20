# analysis_service.py - Standalone Python Flask service
import os
import json
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai

# Load environment variables from parent directory .env file
from dotenv import load_dotenv
# Look for .env file in parent directory (project root)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))
# Also try current directory as fallback
load_dotenv()

# Import your existing analyzer classes
class RiskLevel(Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class ContentItem:
    text: str
    platform: str
    timestamp: datetime
    post_type: str
    engagement: Optional[Dict] = None

@dataclass
class AnalysisResult:
    content_id: str
    risk_level: RiskLevel
    categories: List[str]
    confidence_score: float
    reasoning: str
    red_flags: List[str]

class SocialMediaAnalyzer:
    def __init__(self, gemini_api_key: str):
        genai.configure(api_key=gemini_api_key)
        self.model = genai.GenerativeModel('gemini-pro')

        self.risk_categories = {
            'personal_attacks': {
                'weight': 0.25,
                'description': 'Direct attacks on individuals, name-calling, personal insults'
            },
            'harassment_patterns': {
                'weight': 0.3,
                'description': 'Sustained targeting of individuals or groups'
            },
            'hate_speech': {
                'weight': 0.3,
                'description': 'Content targeting groups based on identity, derogatory language'
            },
            'disinformation': {
                'weight': 0.1,
                'description': 'Deliberately spreading false information'
            },
            'excessive_negativity': {
                'weight': 0.05,
                'description': 'Consistent pattern of unconstructive negative commentary'
            }
        }

    def convert_scraper_json_to_content_items(self, scraper_json: dict) -> List[ContentItem]:
        """Convert scraper JSON to ContentItem objects"""
        content_items = []

        if not scraper_json.get('success', False):
            raise ValueError(f"Scraper failed: {scraper_json.get('error', 'Unknown error')}")

        posts = scraper_json.get('data', {}).get('posts', [])

        for post in posts:
            try:
                # Convert timestamp
                if 'timestamp' in post:
                    timestamp = datetime.fromtimestamp(post['timestamp'] / 1000)
                elif 'date' in post:
                    timestamp = datetime.fromisoformat(post['date'].replace('Z', '+00:00'))
                else:
                    timestamp = datetime.now()

                post_type = self._determine_post_type(post)
                engagement = post.get('stats', {})

                content_item = ContentItem(
                    text=post.get('text', ''),
                    platform=post.get('platform', 'unknown'),
                    timestamp=timestamp,
                    post_type=post_type,
                    engagement=engagement
                )

                content_items.append(content_item)

            except Exception as e:
                print(f"Warning: Failed to convert post {post.get('id', 'unknown')}: {e}")
                continue

        return content_items

    def _determine_post_type(self, post: dict) -> str:
        """Determine post type from content"""
        text = post.get('text', '').lower()
        platform = post.get('platform', '').lower()

        if platform == 'twitter':
            if text.startswith('rt @') or 'retweeted' in text.lower():
                return 'retweet'

        if text.startswith('@') or text.startswith('replying to'):
            return 'reply'

        if 'quoted' in text.lower() or 'shared' in text.lower():
            return 'quote'

        return 'original'

    def analyze_scraper_data(self, scraper_json: dict, candidate_name: str = "Unknown") -> Dict:
        """Main analysis method"""
        try:
            content_items = self.convert_scraper_json_to_content_items(scraper_json)

            if not content_items:
                return {
                    'error': 'No content items found in scraper data',
                    'candidate': candidate_name,
                    'analysis_timestamp': datetime.now().isoformat()
                }

            analysis_results = self.analyze_content_batch(content_items)
            report = self.generate_report(analysis_results, candidate_name)

            # Add scraper metadata
            report['scraper_metadata'] = {
                'platform': scraper_json.get('data', {}).get('platform', 'unknown'),
                'target_user': scraper_json.get('data', {}).get('targetUser', 'unknown'),
                'timeframe': scraper_json.get('data', {}).get('timeframe', 'unknown'),
                'total_posts_scraped': scraper_json.get('data', {}).get('totalPosts', 0),
                'scraped_at': scraper_json.get('data', {}).get('scrapedAt', 'unknown')
            }

            return report

        except Exception as e:
            return {
                'error': f'Analysis failed: {str(e)}',
                'candidate': candidate_name,
                'analysis_timestamp': datetime.now().isoformat()
            }

    def analyze_content_batch(self, content_items: List[ContentItem]) -> Dict:
        """Analyze batch of content items"""
        individual_results = []

        for i, item in enumerate(content_items):
            result = self._analyze_single_item(item, f"item_{i}")
            individual_results.append(result)

        overall_score = self._calculate_overall_score(individual_results)
        pattern_analysis = self._analyze_patterns(individual_results, content_items)

        return {
            'individual_results': individual_results,
            'overall_score': overall_score,
            'pattern_analysis': pattern_analysis,
            'recommendation': self._generate_recommendation(overall_score, pattern_analysis),
            'analysis_timestamp': datetime.now().isoformat()
        }

    def _analyze_single_item(self, content: ContentItem, content_id: str) -> AnalysisResult:
        """Analyze single content item using Gemini"""
        prompt = f"""
        Analyze this social media content for workplace-relevant behavioral concerns:

        Content: "{content.text}"
        Platform: {content.platform}
        Post Type: {content.post_type}
        Engagement: {content.engagement if content.engagement else 'None'}

        Evaluate for these categories:
        1. Personal attacks on individuals
        2. Harassment patterns
        3. Hate speech toward groups
        4. Spreading disinformation
        5. Excessive negativity

        Consider context, sarcasm, cultural communication styles, and whether this is a response to provocation.

        Respond in JSON format:
        {{
            "risk_level": "low|moderate|high|critical",
            "categories": ["list of applicable categories"],
            "confidence_score": 0.0-1.0,
            "reasoning": "detailed explanation",
            "red_flags": ["specific concerning elements"],
            "context_notes": "context considered"
        }}
        """

        try:
            response = self.model.generate_content(prompt)

            # Clean the response text to extract JSON
            response_text = response.text.strip()

            # Find JSON boundaries
            start_idx = response_text.find('{')
            end_idx = response_text.rfind('}') + 1

            if start_idx != -1 and end_idx > start_idx:
                json_text = response_text[start_idx:end_idx]
                analysis_data = json.loads(json_text)
            else:
                # Fallback if no JSON found
                analysis_data = {
                    "risk_level": "low",
                    "categories": [],
                    "confidence_score": 0.1,
                    "reasoning": f"Failed to parse Gemini response: {response_text}",
                    "red_flags": [],
                    "context_notes": "Parsing error occurred"
                }

            return AnalysisResult(
                content_id=content_id,
                risk_level=RiskLevel(analysis_data['risk_level']),
                categories=analysis_data['categories'],
                confidence_score=analysis_data['confidence_score'],
                reasoning=analysis_data['reasoning'],
                red_flags=analysis_data['red_flags']
            )

        except Exception as e:
            return self._fallback_analysis(content, content_id, str(e))

    def _fallback_analysis(self, content: ContentItem, content_id: str, error: str) -> AnalysisResult:
        """Fallback keyword analysis"""
        text_lower = content.text.lower()

        red_flags = []
        categories = []
        risk_level = RiskLevel.LOW

        personal_attack_keywords = ['idiot', 'stupid', 'moron', 'loser', 'pathetic']
        hate_keywords = ['hate', 'disgusting', 'should die', 'kill yourself']

        if any(word in text_lower for word in personal_attack_keywords):
            categories.append('personal_attacks')
            red_flags.append('Personal attack keywords detected')
            risk_level = RiskLevel.MODERATE

        if any(word in text_lower for word in hate_keywords):
            categories.append('hate_speech')
            red_flags.append('Hate speech keywords detected')
            risk_level = RiskLevel.HIGH

        return AnalysisResult(
            content_id=content_id,
            risk_level=risk_level,
            categories=categories,
            confidence_score=0.3,
            reasoning=f"Fallback analysis due to error: {error}",
            red_flags=red_flags
        )

    def _calculate_overall_score(self, results: List[AnalysisResult]) -> Dict:
        """Calculate weighted overall risk score"""
        if not results:
            return {'score': 0, 'risk_level': 'low'}

        total_weighted_score = 0
        total_weight = 0
        category_counts = {}
        high_risk_count = 0

        for result in results:
            if result.risk_level in [RiskLevel.HIGH, RiskLevel.CRITICAL]:
                high_risk_count += 1

            for category in result.categories:
                if category in self.risk_categories:
                    weight = self.risk_categories[category]['weight']
                    risk_score = self._risk_level_to_score(result.risk_level)

                    total_weighted_score += (risk_score * weight * result.confidence_score)
                    total_weight += weight

                    category_counts[category] = category_counts.get(category, 0) + 1

        final_score = (total_weighted_score / max(total_weight, 1)) * 100
        pattern_multiplier = min(1.5, 1 + (high_risk_count / len(results)))
        final_score *= pattern_multiplier

        return {
            'score': min(100, final_score),
            'risk_level': self._score_to_risk_level(final_score),
            'category_breakdown': category_counts,
            'high_risk_post_ratio': high_risk_count / len(results),
            'total_posts_analyzed': len(results)
        }

    def _analyze_patterns(self, results: List[AnalysisResult], content_items: List[ContentItem]) -> Dict:
        """Analyze behavioral patterns"""
        timestamps = [item.timestamp for item in content_items]
        date_range = (min(timestamps), max(timestamps)) if timestamps else (None, None)

        risk_levels = [result.risk_level for result in results]
        consistent_risk = len(set(risk_levels)) <= 2

        platform_analysis = {}
        for item, result in zip(content_items, results):
            platform = item.platform
            if platform not in platform_analysis:
                platform_analysis[platform] = []
            platform_analysis[platform].append(result.risk_level)

        post_type_analysis = {}
        for item, result in zip(content_items, results):
            post_type = item.post_type
            if post_type not in post_type_analysis:
                post_type_analysis[post_type] = {'count': 0, 'high_risk': 0}
            post_type_analysis[post_type]['count'] += 1
            if result.risk_level in [RiskLevel.HIGH, RiskLevel.CRITICAL]:
                post_type_analysis[post_type]['high_risk'] += 1

        return {
            'date_range': {
                'start': date_range[0].isoformat() if date_range[0] else None,
                'end': date_range[1].isoformat() if date_range[1] else None,
                'days_span': (date_range[1] - date_range[0]).days if date_range[0] and date_range[1] else 0
            },
            'consistency': {
                'consistent_behavior': consistent_risk,
                'risk_level_variety': list(set([r.value for r in risk_levels]))
            },
            'platform_differences': {
                platform: {
                    'avg_risk': sum(self._risk_level_to_score(r) for r in risks) / len(risks),
                    'post_count': len(risks)
                } for platform, risks in platform_analysis.items()
            },
            'post_type_patterns': {
                post_type: {
                    'total_count': data['count'],
                    'high_risk_count': data['high_risk'],
                    'high_risk_ratio': data['high_risk'] / data['count'] if data['count'] > 0 else 0
                } for post_type, data in post_type_analysis.items()
            }
        }

    def _generate_recommendation(self, overall_score: Dict, pattern_analysis: Dict) -> Dict:
        """Generate hiring recommendation"""
        score = overall_score['score']

        if score >= 70:
            recommendation = "NOT_RECOMMENDED"
            reason = "High risk of workplace behavioral issues based on social media patterns"
        elif score >= 40:
            recommendation = "PROCEED_WITH_CAUTION"
            reason = "Moderate concerns identified, recommend additional reference checks"
        elif score >= 20:
            recommendation = "ACCEPTABLE_WITH_MONITORING"
            reason = "Minor concerns, standard probationary period sufficient"
        else:
            recommendation = "APPROVED"
            reason = "No significant behavioral red flags identified"

        return {
            'recommendation': recommendation,
            'reason': reason,
            'confidence': min(1.0, score / 100),
            'suggested_actions': self._get_suggested_actions(recommendation),
            'review_required': score >= 40 or overall_score['high_risk_post_ratio'] >= 0.3
        }

    def _get_suggested_actions(self, recommendation: str) -> List[str]:
        """Get suggested actions based on recommendation"""
        actions = {
            'NOT_RECOMMENDED': [
                'Conduct additional behavioral interviews',
                'Require multiple professional references',
                'Consider if role involves public representation',
                'Document specific concerns for HR review'
            ],
            'PROCEED_WITH_CAUTION': [
                'Extended probationary period (90+ days)',
                'Additional reference checks focusing on interpersonal behavior',
                'Document and monitor early workplace interactions',
                'Consider team dynamics and cultural fit'
            ],
            'ACCEPTABLE_WITH_MONITORING': [
                'Standard probationary period',
                'Regular check-ins with supervisor',
                'Team integration assessment',
                'Monitor for early warning signs'
            ],
            'APPROVED': [
                'Standard hiring process',
                'Regular onboarding procedures',
                'No additional monitoring required'
            ]
        }
        return actions.get(recommendation, [])

    def _risk_level_to_score(self, risk_level: RiskLevel) -> float:
        """Convert risk level to numeric score"""
        mapping = {
            RiskLevel.LOW: 0.1,
            RiskLevel.MODERATE: 0.4,
            RiskLevel.HIGH: 0.7,
            RiskLevel.CRITICAL: 1.0
        }
        return mapping.get(risk_level, 0.1)

    def _score_to_risk_level(self, score: float) -> str:
        """Convert numeric score to risk level"""
        if score >= 70:
            return 'critical'
        elif score >= 40:
            return 'high'
        elif score >= 20:
            return 'moderate'
        else:
            return 'low'

    def generate_report(self, analysis_results: Dict, candidate_name: str) -> Dict:
        """Generate comprehensive analysis report"""
        return {
            'candidate': candidate_name,
            'analysis_summary': {
                'overall_score': analysis_results['overall_score']['score'],
                'risk_level': analysis_results['overall_score']['risk_level'],
                'recommendation': analysis_results['recommendation']['recommendation'],
                'posts_analyzed': analysis_results['overall_score']['total_posts_analyzed']
            },
            'detailed_findings': {
                'category_breakdown': analysis_results['overall_score']['category_breakdown'],
                'pattern_analysis': analysis_results['pattern_analysis'],
                'high_risk_ratio': analysis_results['overall_score']['high_risk_post_ratio']
            },
            'individual_posts': [
                {
                    'content_id': result.content_id,
                    'risk_level': result.risk_level.value,
                    'categories': result.categories,
                    'confidence': result.confidence_score,
                    'red_flags': result.red_flags,
                    'reasoning': result.reasoning
                } for result in analysis_results['individual_results']
            ],
            'recommendations': {
                'hiring_decision': analysis_results['recommendation']['recommendation'],
                'reasoning': analysis_results['recommendation']['reason'],
                'suggested_actions': analysis_results['recommendation']['suggested_actions'],
                'requires_review': analysis_results['recommendation']['review_required']
            },
            'metadata': {
                'analysis_timestamp': analysis_results['analysis_timestamp'],
                'model_version': 'gemini-pro',
                'confidence_threshold': 0.6
            }
        }


# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

# Flask Application
app = Flask(__name__)
CORS(app)

# Initialize analyzer
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY not set. Analysis service will not function properly.")

analyzer = SocialMediaAnalyzer(GEMINI_API_KEY) if GEMINI_API_KEY else None

@app.route('/', methods=['GET'])
def index():
    """Root endpoint with service information"""
    return jsonify({
        'service': 'Social Media Analysis Service',
        'version': '1.0.0',
        'status': 'running',
        'gemini_configured': GEMINI_API_KEY is not None,
        'endpoints': {
            'health': '/health',
            'analyze': '/analyze (POST)',
            'batch_analyze': '/analyze/batch (POST)'
        },
        'timestamp': datetime.now().isoformat()
    })

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'social-media-analysis',
        'gemini_configured': GEMINI_API_KEY is not None,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/analyze', methods=['POST'])
def analyze_endpoint():
    """Main analysis endpoint"""
    start_time = time.time()

    try:
        if not analyzer:
            return jsonify({
                'error': 'Analysis service not properly configured - missing GEMINI_API_KEY'
            }), 500

        data = request.get_json()

        if not data:
            return jsonify({
                'error': 'No JSON data provided'
            }), 400

        scraper_json = data.get('scraper_json')
        candidate_name = data.get('candidate_name', 'Unknown Candidate')
        options = data.get('options', {})

        if not scraper_json:
            return jsonify({
                'error': 'Missing scraper_json in request'
            }), 400

        # Perform analysis
        results = analyzer.analyze_scraper_data(scraper_json, candidate_name)

        # Add processing metadata
        processing_time = time.time() - start_time
        results['processing_metadata'] = {
            'processing_time_seconds': round(processing_time, 2),
            'analysis_options': options,
            'service_version': '1.0.0'
        }

        # Set processing time header for the Node.js service
        response = jsonify(results)
        response.headers['X-Processing-Time'] = str(int(processing_time * 1000))

        return response

    except Exception as e:
        processing_time = time.time() - start_time

        print(f"Analysis error: {str(e)}")
        return jsonify({
            'error': f'Analysis failed: {str(e)}',
            'processing_time_seconds': round(processing_time, 2),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/analyze/batch', methods=['POST'])
def batch_analyze_endpoint():
    """Batch analysis endpoint for multiple candidates"""
    start_time = time.time()

    try:
        if not analyzer:
            return jsonify({
                'error': 'Analysis service not properly configured'
            }), 500

        data = request.get_json()
        candidates = data.get('candidates', [])

        if not candidates:
            return jsonify({
                'error': 'No candidates provided for batch analysis'
            }), 400

        results = []

        for candidate in candidates:
            try:
                scraper_json = candidate.get('scraper_json')
                candidate_name = candidate.get('candidate_name', 'Unknown')

                if scraper_json:
                    analysis = analyzer.analyze_scraper_data(scraper_json, candidate_name)
                    results.append({
                        'candidate_name': candidate_name,
                        'analysis': analysis,
                        'status': 'completed'
                    })
                else:
                    results.append({
                        'candidate_name': candidate_name,
                        'error': 'Missing scraper_json',
                        'status': 'failed'
                    })

            except Exception as e:
                results.append({
                    'candidate_name': candidate.get('candidate_name', 'Unknown'),
                    'error': str(e),
                    'status': 'failed'
                })

        processing_time = time.time() - start_time

        return jsonify({
            'batch_results': results,
            'total_candidates': len(candidates),
            'successful_analyses': len([r for r in results if r['status'] == 'completed']),
            'failed_analyses': len([r for r in results if r['status'] == 'failed']),
            'processing_time_seconds': round(processing_time, 2),
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        processing_time = time.time() - start_time
        return jsonify({
            'error': f'Batch analysis failed: {str(e)}',
            'processing_time_seconds': round(processing_time, 2)
        }), 500

if __name__ == '__main__':
    # Use FLASK_PORT if available, otherwise default to 5000
    port = int(os.getenv('FLASK_PORT', os.getenv('PORT', 5000)))
    debug = os.getenv('FLASK_ENV') == 'development'

    print(f"Starting Social Media Analysis Service on port {port}")
    print(f"Debug mode: {debug}")
    print(f"Gemini API configured: {GEMINI_API_KEY is not None}")

    # Ensure we're not using port 3000 (Node.js default)
    if port == 3000:
        print("Warning: Port 3000 detected, switching to 5000 to avoid Node.js conflict")
        port = 5000

    app.run(host='0.0.0.0', port=port, debug=debug)


# -------------------------------------------------------------------

# docker-compose.yml addition for the Python service
"""
version: '3.8'

services:
  # Your existing Node.js service
  social-scraper-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - ANALYSIS_ENABLED=true
      - PYTHON_ANALYSIS_SERVICE_URL=http://analysis-service:5000
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    depends_on:
      - analysis-service
    volumes:
      - ./sessions:/usr/src/app/sessions

  # New Python analysis service
  analysis-service:
    build:
      context: ./analysis-service
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - FLASK_ENV=production
      - PORT=5000
    volumes:
      - ./analysis-service:/app
    restart: unless-stopped
"""

# -------------------------------------------------------------------

# analysis-service/Dockerfile
"""
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd --create-home --shell /bin/bash app && chown -R app:app /app
USER app

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Start the application
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "analysis_service:app"]
"""