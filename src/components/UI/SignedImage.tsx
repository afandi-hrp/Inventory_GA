import React, { useEffect, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { getSignedUrl } from '../../lib/signedStorage';

interface SignedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  bucket: string;
  path: string | null | undefined;
  containerClassName?: string;
}

export default function SignedImage({ bucket, path, alt, className, containerClassName, onClick, ...rest }: SignedImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);

    if (!path) {
      setLoading(false);
      return;
    }

    setLoading(true);
    getSignedUrl(bucket, path).then((url) => {
      if (!cancelled) {
        setSrc(url);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [bucket, path]);

  if (!path || (!loading && !src)) {
    return (
      <div className={containerClassName || className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', color: '#9ca3af' }}>
        <ImageIcon size={20} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={containerClassName || className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', color: '#9ca3af' }}>
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  return (
    <img
      src={src!}
      alt={alt}
      className={className}
      onClick={onClick}
      referrerPolicy="no-referrer"
      {...rest}
    />
  );
}
