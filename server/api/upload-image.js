// server/api/upload-image.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  try {
    const { imageData, mimeType, vendorId } = req.body;

    if (!imageData || !mimeType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: imageData, mimeType',
      });
    }

    const ext = mimeType.split('/')[1] || 'jpg';
    const randomId = Math.random().toString(36).slice(2, 10);
    const timestamp = Date.now();
    const folder = vendorId || 'anonymous';
    const filename = `${folder}/${timestamp}-${randomId}.${ext}`;

    const buffer = Buffer.from(imageData, 'base64');

    const uploadResult = await supabase.storage
      .from('product-images')
      .upload(filename, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadResult.error) {
      console.error('Supabase upload error:', uploadResult.error);
      return res.status(500).json({
        success: false,
        error: uploadResult.error.message,
      });
    }

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(filename);

    return res.status(200).json({
      success: true,
      url: urlData.publicUrl,
    });

  } catch (error) {
    console.error('Upload image error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
