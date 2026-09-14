interface OmniDesktop {
  hide: () => void;
  show: () => void;
  resize?: (w: number, h: number) => void;
  onListen?: (cb: () => void) => () => void;
}

interface Window {
  omniDesktop?: OmniDesktop;
}
