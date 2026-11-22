/**
 * Official Hardcoded Brand Logo for SC Basimbuzi
 * Embedded directly into the codebase from the official club emblem:
 * Circular badge with navy blue ring, "SC BASIMBUZI", Lion holding two beer bottles (1925), and 3 gold stars.
 * 100% self-contained, offline-ready, cannot be lost or broken.
 */
import React from 'react';
import { HARDCODED_LOGO_BASE64 } from './logoBase64';

// Permanent Base64 Data URL embedded into code bundle
export const HARDCODED_LOGO_URL = HARDCODED_LOGO_BASE64;
export const DEFAULT_APP_LOGO = HARDCODED_LOGO_URL;

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  size?: number | string;
  className?: string;
}

export const ScBasimbuziLogo: React.FC<LogoProps> = ({ size = 48, className = '', style, ...props }) => {
  return (
    <img 
      src={HARDCODED_LOGO_BASE64}
      alt="SC Basimbuzi"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', ...style }}
      className={`rounded-full shrink-0 select-none ${className}`}
      {...props}
    />
  );
};
