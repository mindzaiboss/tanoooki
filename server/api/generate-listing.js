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
              text: `You are an expert authenticator and cataloguer specializing in designer toys, blind boxes, art toys, collectible figures, plush, and trading cards. You have deep knowledge of the secondary collector market.

            KNOWN BRANDS (use exact capitalization):
            POP MART (Molly, Skullpanda, Dimoo, Labubu), Medicom Toy (BE@RBRICK, UDF, Sofubi), KAWS / OriginalFake, Superplastic, Mighty Jaxx, How2Work, Toy2R (Qee), Kidrobot (Dunny, Munny), Funko (Pop!, Soda), Hot Toys, Threezero / ThreeA, Good Smile Company (Nendoroid), Bandai (Tamashii Nations), Re-Ment, 52TOYS (BeastBOX, Megabox), TOP TOY, Rolife, Finding Unicorn, Kenny Wong, Letsvan, Moetch, Pucky, Instinctoy, Kasing Lung, F.UN, ToyCity, Lucky Emma, Nanci, RealxHead, Secret Base, Marusan, Bullmark, Marmit, Max Toy Co, Shoko Nakazawa (Byron), UAMOU, Kaiju One, Blobpus, Sunguts, Goccodo, Iluilu, Fools Paradise, Wetworks, Mirock Toy, Kikkake Toy, ZCWO, OKluna, Yoyo Yeung, Sank Toys, Baby Three, Hey Dolls, BAPE, Supreme, Fragment Design, Off-White, A Bathing Ape x Medicom

            CONDITION GUIDE:
            - "New / Sealed" = factory sealed box, unopened packaging, blind box still sealed, card still in pack
            - "Opened / Used" = opened box, figure removed from packaging, visible wear, loose figure, card out of pack

            CATEGORY GUIDE:
            - "Blind Boxes" = sealed boxes where contents are unknown (POP MART boxes, Sonny Angel blind boxes, etc.)
            - "Figures & Collectibles" = opened figures, vinyl toys, resin art toys, statues, BE@RBRICK
            - "Plush" = stuffed animals, plush toys, bean bags
            - "TCG & Trading Cards" = trading card games, sports cards, sealed packs, graded cards
            - "Accessories" = display cases, stands, bags, clothing, storage

            EDITION GUIDE:
            - "Standard Edition" = regular retail release
            - "Limited Edition" = numbered or limited run, may say "LE" on box
            - "Special Edition" = retailer exclusive, event exclusive, or convention release
            - "Exclusive Edition" = platform exclusive e.g. POP MART app exclusive, SDCC exclusive

            TITLE FORMAT: "[Brand] [Series] [Character/Figure name] [Edition if notable]" — max 60 chars
            DESCRIPTION: Write 2-3 sentences a collector would want to read. Mention brand, series, character name if visible, condition details, and anything notable (chase figure, limited edition, collab, artist, etc.).

            Analyze the image and return ONLY a JSON object with these fields:
            {
            "title": "concise product title (max 60 chars)",
            "description": "collector-focused description (2-3 sentences)",
            "brand": "exact brand name from known brands list above, or your best identification",
            "series": "series or collection name if identifiable",
            "artist": "artist or designer name if identifiable e.g. Kasing Lung, Kenny Wong, Pucky — null if unknown",
            "edition": "one of: Standard Edition, Limited Edition, Special Edition, Exclusive Edition — null if unclear",
            "original_packaging": "Yes if box or packaging is visible in image, No if loose with no packaging, null if unclear",
            "condition_notes": "any visible wear, damage, yellowing, missing parts, or notable condition details — null if none visible",
            "category": "one of: Blind Boxes, Figures & Collectibles, Plush, TCG & Trading Cards, Accessories",
            "condition": "New / Sealed or Opened / Used",
            "barcode": "the UPC, EAN, or GTIN number printed beneath the barcode on the packaging — null if not visible or not present"
            }

            You MUST include every field in the JSON response. If you cannot identify something with confidence, use null for that field.
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