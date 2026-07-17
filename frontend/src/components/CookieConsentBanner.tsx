import React, { useEffect, useState } from 'react';
import Cookies from 'js-cookie';

export function CookieConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = Cookies.get('analytics-consent');
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const acceptCookies = () => {
    Cookies.set('analytics-consent', 'accepted', { expires: 365 });
    setShowBanner(false);
    window.location.reload();
  };

  const declineCookies = () => {
    Cookies.set('analytics-consent', 'declined', { expires: 365 });
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-4 z-50 shadow-lg border-t border-gray-800">
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-sm">
          <p className="font-semibold mb-1">We value your privacy</p>
          <p className="text-gray-300">We use privacy-friendly analytics to understand how you use StarkEd so we can improve the platform. Your data remains anonymous.</p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <button 
            onClick={declineCookies}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Decline
          </button>
          <button 
            onClick={acceptCookies}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            Accept Analytics
          </button>
        </div>
      </div>
    </div>
  );
}
