const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.apiKey = process.env.GOOGLE_AI_API_KEY;
    this.amedApiKey = process.env.GOOGLE_AMED_API_KEY;

    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    }

    // Supported languages for story generation
    this.supportedLanguages = {
      'en': 'English',
      'hi': 'Hindi',
      'bn': 'Bengali',
      'ta': 'Tamil',
      'te': 'Telugu',
      'mr': 'Marathi',
      'gu': 'Gujarati',
      'kn': 'Kannada',
      'ml': 'Malayalam',
      'pa': 'Punjabi',
      'or': 'Odia'
    };

    // Crop knowledge base
    this.cropDatabase = {
      rice: {
        type: 'cereal',
        seasons: ['kharif', 'rabi'],
        regions: ['Punjab', 'Haryana', 'Uttar Pradesh', 'West Bengal', 'Andhra Pradesh'],
        nutritionalValue: 'High in carbohydrates, provides energy, contains B vitamins',
        economicImportance: 'Staple food crop, major export commodity'
      },
      wheat: {
        type: 'cereal',
        seasons: ['rabi'],
        regions: ['Punjab', 'Haryana', 'Uttar Pradesh', 'Madhya Pradesh'],
        nutritionalValue: 'Rich in protein, fiber, vitamins, and minerals',
        economicImportance: 'Major food crop, flour production, animal feed'
      },
      maize: {
        type: 'cereal',
        seasons: ['kharif', 'rabi'],
        regions: ['Karnataka', 'Andhra Pradesh', 'Maharashtra', 'Rajasthan'],
        nutritionalValue: 'High energy, vitamins A and C, antioxidants',
        economicImportance: 'Food, feed, industrial uses, biofuel production'
      },
      cotton: {
        type: 'fiber',
        seasons: ['kharif'],
        regions: ['Gujarat', 'Maharashtra', 'Andhra Pradesh', 'Punjab'],
        nutritionalValue: 'Not edible, used for fiber production',
        economicImportance: 'Textile industry, major export crop'
      },
      sugarcane: {
        type: 'cash',
        seasons: ['kharif', 'rabi'],
        regions: ['Uttar Pradesh', 'Maharashtra', 'Karnataka', 'Tamil Nadu'],
        nutritionalValue: 'Sugar production, ethanol',
        economicImportance: 'Sugar industry, sweetener production'
      }
    };
  }

  /**
   * Generate crop story in specified language
   */
  async generateCropStory(cropData, language = 'en', storyType = 'comprehensive') {
    try {
      if (!this.model) {
        throw new Error('Google Gemini API key not configured');
      }

      const prompt = this.buildStoryPrompt(cropData, language, storyType);

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const story = response.text();

      // Clean and format the story
      const formattedStory = this.formatStory(story, cropData, language);

      logger.info(`Generated ${storyType} story for ${cropData.name} in ${language}`);

      return {
        story: formattedStory,
        language,
        storyType,
        cropId: cropData.cropId || cropData._id,
        generatedAt: new Date(),
        metadata: {
          model: 'gemini-1.5-flash',
          language: this.supportedLanguages[language] || language,
          wordCount: formattedStory.split(' ').length,
          cropType: cropData.cropType,
          region: cropData.location?.city || 'Unknown'
        }
      };

    } catch (error) {
      logger.error('Error generating crop story:', error);

      // Fallback to template-based story generation
      return this.generateFallbackStory(cropData, language, storyType);
    }
  }

  /**
   * Build prompt for story generation
   */
  buildStoryPrompt(cropData, language, storyType) {
    const languageName = this.supportedLanguages[language] || 'English';

    let prompt = `Generate a compelling ${storyType} story about this crop in ${languageName}. `;

    if (language !== 'en') {
      prompt += `Respond in ${languageName} language only. `;
    }

    prompt += `Make it engaging and informative for consumers who want to know the journey from farm to table.

Crop Details:
- Name: ${cropData.name}
- Type: ${cropData.cropType}
- Variety: ${cropData.variety || 'Local variety'}
- Location: ${cropData.location?.farmName || 'Farm'}, ${cropData.location?.city || 'Unknown region'}
- Farmer: ${cropData.farmer?.name || 'Local farmer'}
- Quantity: ${cropData.quantity?.value || 0} ${cropData.quantity?.unit || 'kg'}
- Quality Grade: ${cropData.quality?.grade || 'Standard'}
- Organic: ${cropData.cultivation?.organic ? 'Yes' : 'No'}
- Harvest Date: ${cropData.cultivation?.harvestDate ? new Date(cropData.cultivation.harvestDate).toLocaleDateString() : 'Recent harvest'}

`;

    switch (storyType) {
      case 'comprehensive':
        prompt += `Create a detailed story covering:
1. The farmer's dedication and farming practices
2. The crop's journey from seed to harvest
3. Unique characteristics and quality aspects
4. Nutritional benefits and culinary uses
5. Cultural significance in the region
6. Sustainable farming practices used

Make it approximately 300-400 words, engaging and trustworthy.`;
        break;

      case 'brief':
        prompt += `Create a concise story covering:
1. Farmer's story and farming practices
2. Crop quality and unique features
3. Nutritional highlights

Keep it to 100-150 words, warm and inviting.`;
        break;

      case 'technical':
        prompt += `Focus on technical aspects:
1. Cultivation methods and agricultural practices
2. Quality parameters and certifications
3. Nutritional composition and health benefits
4. Storage and handling requirements

Make it informative for B2B buyers, approximately 200-250 words.`;
        break;

      default:
        prompt += `Create an engaging story that highlights the crop's journey and quality.`;
    }

    return prompt;
  }

  /**
   * Format and clean the generated story
   */
  formatStory(story, cropData, language) {
    // Remove any unwanted formatting or prefixes
    let cleanedStory = story
      .replace(/^#{1,6}\s*/gm, '') // Remove markdown headers
      .replace(/\*\*/g, '') // Remove bold markdown
      .replace(/\*/g, '') // Remove italic markdown
      .trim();

    // Add crop emoji based on type
    const cropEmojis = {
      cereals: '🌾',
      pulses: '🫘',
      oilseeds: '🌰',
      vegetables: '🥕',
      fruits: '🍎',
      spices: '🌶️',
      plantation: '🌴',
      flowers: '🌸',
      medicinal: '🌿',
      fodder: '🌱'
    };

    const emoji = cropEmojis[cropData.cropType] || '🌾';
    cleanedStory = `${emoji} ${cleanedStory}`;

    return cleanedStory;
  }

  /**
   * Fallback story generation when AI is unavailable
   */
  generateFallbackStory(cropData, language, storyType) {
    const templates = {
      en: {
        comprehensive: `${cropData.name} from ${cropData.location?.city || 'a beautiful farm'} represents the finest in sustainable agriculture. Grown by dedicated farmer ${cropData.farmer?.name || 'local farmers'} using traditional methods combined with modern quality standards, this ${cropData.cropType} crop has been nurtured from seed to harvest with care and expertise.

The journey begins with carefully selected seeds planted in fertile soil, tended through the growing season with proper irrigation and natural pest management. ${cropData.cultivation?.organic ? 'Certified organic practices ensure no chemical pesticides or fertilizers were used, maintaining the purity of the land and the crop.' : 'Modern agricultural techniques ensure optimal growth and quality.'}

Harvested at peak maturity, this ${cropData.quality?.grade || 'premium'} grade crop offers exceptional nutritional value and culinary versatility. Rich in essential nutrients, it's perfect for traditional dishes and modern cuisine alike.

Each purchase supports sustainable farming and connects you directly with the hardworking farmers who bring this quality produce to your table.`,
        brief: `Discover ${cropData.name} from ${cropData.location?.city || 'local farms'} - premium quality ${cropData.cropType} grown with care by farmer ${cropData.farmer?.name || 'experienced farmers'}. ${cropData.cultivation?.organic ? 'Certified organic and ' : ''}packed with nutrients for your healthy lifestyle.`
      }
    };

    const template = templates[language] || templates.en;
    const story = template[storyType] || template.comprehensive;

    return {
      story,
      language,
      storyType,
      cropId: cropData.cropId || cropData._id,
      generatedAt: new Date(),
      metadata: {
        model: 'fallback-template',
        language: this.supportedLanguages[language] || language,
        wordCount: story.split(' ').length,
        cropType: cropData.cropType,
        region: cropData.location?.city || 'Unknown',
        fallback: true
      }
    };
  }

  /**
   * Analyze crop data and provide insights
   */
  async analyzeCrop(cropData) {
    try {
      if (!this.model) {
        throw new Error('Google Gemini API key not configured');
      }

      const prompt = `Analyze this crop data and provide farming insights, market recommendations, and quality assessment:

Crop: ${cropData.name}
Type: ${cropData.cropType}
Location: ${cropData.location?.city}, ${cropData.location?.state}
Quality Grade: ${cropData.quality?.grade}
Moisture: ${cropData.quality?.moistureContent}%
Organic: ${cropData.cultivation?.organic ? 'Yes' : 'No'}
Harvest Date: ${cropData.cultivation?.harvestDate ? new Date(cropData.cultivation.harvestDate).toLocaleDateString() : 'Not specified'}
Price: ₹${cropData.pricing?.basePrice} per ${cropData.quantity?.unit}

Provide analysis in JSON format with these keys:
- farming_practices: Assessment of cultivation methods
- quality_score: Rating out of 10
- market_potential: High/Medium/Low with reasoning
- recommendations: Array of improvement suggestions
- price_analysis: Fair market value assessment
- storage_advice: How long it can be stored and conditions`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const analysisText = response.text();

      // Parse JSON response
      const analysis = this.parseAnalysisResponse(analysisText);

      return {
        ...analysis,
        cropId: cropData.cropId || cropData._id,
        analyzedAt: new Date(),
        aiPowered: true
      };

    } catch (error) {
      logger.error('Error analyzing crop:', error);

      // Fallback analysis
      return this.generateFallbackAnalysis(cropData);
    }
  }

  /**
   * Parse AI analysis response
   */
  parseAnalysisResponse(responseText) {
    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // If no JSON found, create structured response from text
      return {
        farming_practices: 'Analysis completed',
        quality_score: 7,
        market_potential: 'Medium',
        recommendations: ['Regular quality checks recommended'],
        price_analysis: 'Market competitive',
        storage_advice: 'Store in cool, dry place'
      };

    } catch (error) {
      logger.error('Error parsing analysis response:', error);
      return {
        farming_practices: 'Unable to analyze farming practices',
        quality_score: 5,
        market_potential: 'Unknown',
        recommendations: ['Consult local agricultural experts'],
        price_analysis: 'Price analysis unavailable',
        storage_advice: 'Follow standard storage guidelines'
      };
    }
  }

  /**
   * Fallback crop analysis
   */
  generateFallbackAnalysis(cropData) {
    const qualityScore = cropData.quality?.grade === 'A+' ? 9 :
                        cropData.quality?.grade === 'A' ? 8 :
                        cropData.quality?.grade === 'B+' ? 7 : 6;

    return {
      farming_practices: `${cropData.cultivation?.organic ? 'Organic' : 'Conventional'} farming practices observed`,
      quality_score: qualityScore,
      market_potential: qualityScore > 8 ? 'High' : qualityScore > 6 ? 'Medium' : 'Low',
      recommendations: [
        'Maintain consistent quality standards',
        'Consider organic certification if not already certified',
        'Regular soil testing recommended'
      ],
      price_analysis: `Current pricing appears ${cropData.pricing?.isNegotiable ? 'negotiable' : 'fixed'} at market rates`,
      storage_advice: 'Store in cool, dry conditions away from direct sunlight',
      cropId: cropData.cropId || cropData._id,
      analyzedAt: new Date(),
      aiPowered: false
    };
  }

  /**
   * Generate crop recommendations based on location and season
   */
  async getCropRecommendations(location, season, preferences = {}) {
    try {
      if (!this.model) {
        throw new Error('Google Gemini API key not configured');
      }

      const prompt = `Recommend suitable crops for farming in ${location} during ${season} season.

Consider:
- Local climate and soil conditions
- Market demand and profitability
- Water availability and irrigation needs
- ${preferences.organic ? 'Organic farming practices' : 'Modern agricultural methods'}
- ${preferences.experience || 'General'} farmer experience level

Provide recommendations in JSON format with:
- recommended_crops: Array of crop objects with name, type, expected_yield, profitability, difficulty_level
- seasonal_factors: Current season advantages and challenges
- market_insights: Current market trends and demands
- risk_assessment: Potential risks and mitigation strategies`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const recommendationsText = response.text();

      const recommendations = this.parseRecommendationsResponse(recommendationsText);

      return {
        ...recommendations,
        location,
        season,
        generatedAt: new Date(),
        preferences
      };

    } catch (error) {
      logger.error('Error getting crop recommendations:', error);
      return this.generateFallbackRecommendations(location, season, preferences);
    }
  }

  /**
   * Parse recommendations response
   */
  parseRecommendationsResponse(responseText) {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        recommended_crops: [],
        seasonal_factors: 'Analysis completed',
        market_insights: 'Market data available',
        risk_assessment: 'Risk assessment completed'
      };

    } catch (error) {
      logger.error('Error parsing recommendations:', error);
      return {
        recommended_crops: [],
        seasonal_factors: 'Unable to analyze seasonal factors',
        market_insights: 'Market insights unavailable',
        risk_assessment: 'Risk assessment not available'
      };
    }
  }

  /**
   * Fallback crop recommendations
   */
  generateFallbackRecommendations(location, season, preferences) {
    const commonCrops = {
      kharif: ['rice', 'maize', 'cotton', 'soybean'],
      rabi: ['wheat', 'mustard', 'peas', 'potatoes'],
      zaid: ['cucumber', 'watermelon', 'muskmelon']
    };

    const crops = commonCrops[season] || ['rice', 'wheat'];

    return {
      recommended_crops: crops.map(crop => ({
        name: crop,
        type: this.cropDatabase[crop]?.type || 'unknown',
        expected_yield: 'Varies by conditions',
        profitability: 'Medium',
        difficulty_level: 'Medium'
      })),
      seasonal_factors: `${season} season in ${location} offers good growing conditions for selected crops`,
      market_insights: 'Local market demand should be assessed before planting',
      risk_assessment: 'Regular monitoring and pest management recommended',
      location,
      season,
      generatedAt: new Date(),
      preferences,
      fallback: true
    };
  }

  /**
   * Translate text to specified language
   */
  async translateText(text, targetLanguage) {
    try {
      if (!this.model || !this.supportedLanguages[targetLanguage]) {
        throw new Error('Translation service unavailable');
      }

      const prompt = `Translate the following text to ${this.supportedLanguages[targetLanguage]}. Maintain the agricultural and farming context accurately:

"${text}"

Provide only the translated text without any additional comments or explanations.`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const translatedText = response.text().trim();

      return {
        originalText: text,
        translatedText,
        sourceLanguage: 'en',
        targetLanguage,
        translatedAt: new Date()
      };

    } catch (error) {
      logger.error('Error translating text:', error);
      return {
        originalText: text,
        translatedText: text, // Return original if translation fails
        sourceLanguage: 'en',
        targetLanguage,
        error: 'Translation failed',
        translatedAt: new Date()
      };
    }
  }

  /**
   * Check service health
   */
  async healthCheck() {
    try {
      const health = {
        service: 'ai-service',
        status: this.model ? 'healthy' : 'unhealthy',
        timestamp: new Date(),
        supportedLanguages: Object.keys(this.supportedLanguages).length,
        apiKeyConfigured: !!this.apiKey
      };

      if (this.model) {
        // Quick test
        const testResult = await this.model.generateContent('Say "OK" in one word');
        health.lastTest = {
          success: true,
          responseTime: Date.now() - health.timestamp.getTime()
        };
      }

      return health;

    } catch (error) {
      logger.error('AI service health check failed:', error);
      return {
        service: 'ai-service',
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date()
      };
    }
  }
}

module.exports = new AIService();