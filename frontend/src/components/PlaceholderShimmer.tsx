import React from 'react';

interface PlaceholderShimmerProps {
  visible: boolean;
  message?: string;
}

export const PlaceholderShimmer: React.FC<PlaceholderShimmerProps> = ({ visible, message = "Processing intent..." }) => {
  if (!visible) return null;

  return (
    <div className="shimmer-overlay">
      <div className="shimmer-card">
        <div className="shimmer-line header"></div>
        <div className="shimmer-line sub"></div>
        <div className="shimmer-spinner"></div>
        <p className="shimmer-text">{message}</p>
      </div>
    </div>
  );
};
