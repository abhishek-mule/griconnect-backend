const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

// Initialize Google's Generative AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// AI model configuration
const AI_CONFIG = {
  // Text generation model
  TEXT_GENERATION: {
    model: 'gemini-pro',
    temperature: 0.7,
    maxOutputTokens: 1024,
    topP: 0.8,
    topK: 40
  },
  
  // Image generation model
  IMAGE_GENERATION: {
    model: 'gemini-pro-vision',
    maxOutputTokens: 2048
  },
  
  // Content safety settings
  SAFETY_SETTINGS: [
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    },
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    }
  ],
  
  // Rate limiting
  RATE_LIMIT: {
    maxRequests: 60, // 60 requests per minute
    perMinute: 60 * 1000
  }
};

// Get configured AI model
const getModel = (modelType = 'text') => {
  try {
    const config = modelType === 'image' 
      ? AI_CONFIG.IMAGE_GENERATION 
      : AI_CONFIG.TEXT_GENERATION;
    
    return genAI.getGenerativeModel({
      model: config.model,
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        topP: config.topP,
        topK: config.topK
      },
      safetySettings: AI_CONFIG.SAFETY_SETTINGS
    });
  } catch (error) {
    logger.error('Failed to initialize AI model:', error);
    throw new Error(`AI model initialization failed: ${error.message}`);
  }
};

// Generate text content
const generateText = async (prompt, options = {}) => {
  try {
    const model = getModel('text');
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{
          text: prompt
        }]
      }],
      ...options
    });
    
    const response = await result.response;
    return response.text();
  } catch (error) {
    logger.error('Text generation failed:', error);
    throw new Error(`Text generation failed: ${error.message}`);
  }
};

// Generate image description
const describeImage = async (imageData, prompt = 'Describe this image in detail') => {
  try {
    const model = getModel('image');
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageData.toString('base64')
        }
      }
    ]);
    
    const response = await result.response;
    return response.text();
  } catch (error) {
    logger.error('Image description failed:', error);
    throw new Error(`Image description failed: ${error.message}`);
  }
};

// Generate crop story
const generateCropStory = async (cropData) => {
  const prompt = `
    Create an engaging story about this agricultural product:
    
    Crop Type: ${cropData.cropType}
    Variety: ${cropData.variety}
    Location: ${cropData.location?.farmName || 'Farm'} in ${cropData.location?.coordinates || 'unknown location'}
    Cultivation: ${cropData.practices?.organic ? 'Organically' : 'Conventionally'} grown
    Special Notes: ${cropData.notes || 'No additional notes'}
    
    The story should be engaging for consumers, highlighting the journey from farm to table, 
    the farmer's dedication, and the sustainable practices used. Keep it under 200 words.
  `;
  
  return generateText(prompt, {
    temperature: 0.8,
    maxOutputTokens: 1024
  });
};

// Generate sustainability insights
const generateSustainabilityInsights = async (cropData) => {
  const prompt = `
    Analyze the following agricultural data and provide sustainability insights:
    
    ${JSON.stringify(cropData, null, 2)}
    
    Provide a structured analysis including:
    1. Environmental impact score (1-10)
    2. Water usage efficiency
    3. Carbon footprint estimate
    4. Suggested improvements for sustainability
    
    Format the response as a JSON object.
  `;
  
  const response = await generateText(prompt, {
    temperature: 0.3,
    maxOutputTokens: 1024
  });
  
  try {
    return JSON.parse(response);
  } catch (error) {
    logger.error('Failed to parse AI response:', error);
    return { error: 'Failed to generate insights' };
  }
};

module.exports = {
  AI_CONFIG,
  getModel,
  generateText,
  describeImage,
  generateCropStory,
  generateSustainabilityInsights
};
