// Use the package entry directly to avoid Vinext's optional sharp type stub.
import sharp from 'sharp/lib/index.js';
export const MAX_AVATAR_BYTES=5*1024*1024;
export async function normalizeAvatar(bytes:Buffer) {
  if(!bytes.length||bytes.length>MAX_AVATAR_BYTES)throw new Error('Choose an image under 5 MB.');
  const options={limitInputPixels:16000000,failOn:'error' as const};
  const info=await sharp(bytes,options).metadata();
  if(!['jpeg','png','webp'].includes(info.format??''))throw new Error('Choose a JPG, PNG or WebP image.');
  return sharp(bytes,options).rotate().resize(256,256,{fit:'cover'}).jpeg({quality:82}).toBuffer();
}
