'use client';

import { ImageEditor, type ImageEditorProps } from '@image-ultra/react';

/** A live editor inside a docs page. */
export function Demo(props: ImageEditorProps) {
  return (
    <div className="demo">
      <ImageEditor src="/sample.jpg" theme="auto" {...props} />
    </div>
  );
}
