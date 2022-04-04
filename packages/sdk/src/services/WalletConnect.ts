import Platform, { PlatformName } from '../Platform';
//import InstallModal from '../ui/InstallModal';

const WalletConnect = {
  WalletConnectInstance: null,
  connector: null,
  getConnector() {
    if (!this.connector) {
      const WCInstance = this.WalletConnectInstance;
      if(!WCInstance) throw new Error("WalletConnectInstance must be provided")
      this.connector = new WCInstance({
        bridge: 'https://bridge.walletconnect.org', // Required
      });
    }

    return this.connector;
  },
  forceRestart: false,
  isConnected() {
    return this.getConnector().connected;
  },
  sentFirstConnect: false,
  startConnection() {
    return new Promise((resolve, reject) => {
      if (this.getConnector().connected) {
        return resolve(true);
      }

      this.getConnector()
        .createSession()
        .then(() => {
          const link = `${'https://metamask.app.link/wc?uri='}${encodeURIComponent(
            this.getConnector().uri,
          )}`;

          const isDesktop = Platform.getPlatform() === PlatformName.DesktopWeb;

          if (isDesktop) {
            //InstallModal({ link });
            console.log('OPEN LINK', link);
          } else {
            console.log('OPEN LINK', link);
            // window.location.assign(link);
            Platform.openLink(link);
          }

          this.getConnector().on('connect', () => {
            if (this.sentFirstConnect) {
              return;
            }
            resolve(true);
            this.sentFirstConnect = true;
          });
        })
        .catch((error) => reject(error));
    });
  },
};

export default WalletConnect;