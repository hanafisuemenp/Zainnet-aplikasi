import React from 'react';
import NotaApp from '../nota/App';

export const NotaHardcover: React.FC<{ onBackToHome?: () => void }> = ({ onBackToHome }) => {
  return <NotaApp onBackToHome={onBackToHome} />;
};

export default NotaHardcover;
