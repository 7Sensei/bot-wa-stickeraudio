declare module 'node-webpmux' {
  export class Image {
    constructor();
    load(filePathOrBuffer: string | Buffer): Promise<void>;
    save(filePathOrBuffer?: string | null): Promise<Buffer>;
    exif: Buffer | null;
  }

  const webp: {
    Image: typeof Image;
  };

  export default webp;
}
