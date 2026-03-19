const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const normalizeMediaType = (mediaType) => {
  if (!mediaType) return 'image/jpeg';
  if (mediaType === 'image/jpg') return 'image/jpeg';
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) return mediaType;
  return 'image/jpeg';
};

module.exports = async (req, res) => {
  try {
    console.log('Received request body keys:', Object.keys(req.body || {}));
    console.log('Images array length:', req.body?.images?.length);

    const { images, category } = req.body;

    if (!images || images.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    // Build image content for Claude, fetching URLs server-side if needed
    const imageContent = await Promise.all(images.map(async image => {
      let base64 = image.data;
      let mediaType = image.mediaType;

      if (typeof image.data === 'string' && image.data.startsWith('http')) {
        const imgResponse = await fetch(image.data);
        const buffer = await imgResponse.arrayBuffer();
        base64 = Buffer.from(buffer).toString('base64');
        mediaType = imgResponse.headers.get('content-type') || 'image/jpeg';
      }

      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: normalizeMediaType(mediaType),
          data: base64,
        },
      };
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
    const cleanContent = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const listing = JSON.parse(cleanContent);

    res.json({ success: true, listing });
  } catch (error) {
    console.error('Full error:', error);
    res.status(500).json({ error: 'Failed to generate listing details' });
  }
};