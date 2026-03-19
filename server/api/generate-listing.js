const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

module.exports = async (req, res) => {
  try {
    const { images, category } = req.body;

    if (!images || images.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    // Build image content for Claude
    const imageContent = images.map(image => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mediaType,
        data: image.data,
      },
    }));

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text',
              text: `You are an expert in designer toys, blind boxes, collectibles, and trading cards. 
              Analyze this image and provide listing details for a marketplace called Tanoooki.
              
              Return ONLY a JSON object with these fields:
              {
                "title": "concise product title (max 60 chars)",
                "description": "detailed description mentioning brand, series, condition details, and anything collectors would want to know (2-3 sentences)",
                "brand": "brand name e.g. POP MART, Medicom Toy, Sonny Angel",
                "series": "series or collection name if identifiable",
                "category": "one of: Blind Boxes, Figures & Collectibles, Plush, TCG & Trading Cards, Accessories",
                "condition": "your best guess: New / Sealed or Opened / Used"
              }
              
              If you cannot identify something with confidence, use null for that field.
              Return ONLY the JSON, no other text.`,
            },
          ],
        },
      ],
    });

    const content = response.content[0].text;
    const listing = JSON.parse(content);

    res.json({ success: true, listing });
  } catch (error) {
    console.error('Error generating listing:', error);
    res.status(500).json({ error: 'Failed to generate listing details' });
  }
};