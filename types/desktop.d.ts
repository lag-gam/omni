interface OmniDesktop {
  hide: () => void;
}

interface Window {
  omniDesktop?: OmniDesktop;
}
