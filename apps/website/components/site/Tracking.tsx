import Script from 'next/script';
import { CONSENT_KEY } from '@/lib/consent';
import { GA_MEASUREMENT_ID, META_PIXEL_ID } from '@/lib/site';

/**
 * The measurement tags, loaded after the page is interactive so they never delay it. The Meta
 * Pixel counts page views and, from the waitlist form, leads; Google Analytics does the same once
 * its id is set. Both start with consent denied — Google's consent signals, Meta's revoke — unless
 * this browser already accepted, and the banner updates them the moment it is answered. Nothing
 * here reads anything a visitor typed.
 */
export function Tracking() {
  return (
    <>
      {META_PIXEL_ID && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');var c=null;try{c=localStorage.getItem('${CONSENT_KEY}')}catch(e){}if(c!=='granted'){fbq('consent','revoke')}fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
          </Script>
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              alt=""
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}
      {GA_MEASUREMENT_ID && (
        // The loader is appended from the inline script, the way the pixel's own snippet does it:
        // one script element, no `src` prop for a cached type check on the build host to misread.
        <Script id="ga4" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}var c=null;try{c=localStorage.getItem('${CONSENT_KEY}')}catch(e){}var g=c==='granted'?'granted':'denied';gtag('consent','default',{ad_storage:g,ad_user_data:g,ad_personalization:g,analytics_storage:g,wait_for_update:500});gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}';document.head.appendChild(s);`}
        </Script>
      )}
    </>
  );
}
