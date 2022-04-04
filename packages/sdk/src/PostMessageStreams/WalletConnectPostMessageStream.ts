import { Duplex } from 'stream';
import { Buffer } from 'buffer';
import WalletConnect from '../services/WalletConnect';
import { METHODS_TO_REDIRECT, ProviderConstants } from '../constants';
import Ethereum from '../services/Ethereum';
import Platform, { PlatformName } from '../Platform';

const noop = () => undefined;

/**
 * Creates a stream that's both readable and writable.
 * The stream supports arbitrary objects.
 *
 * @class
 * @param {Object} port Remote Port object
 */
class WalletConnectPostMessageStream extends Duplex {
  _name: any;

  _port: any;

  _origin: string;

  _onMessage: any;

  _onDisconnect: () => void;

  private _alreadySubscribed: boolean;

  constructor(port) {
    super();
    Duplex.call(this, {
      objectMode: true,
    });
    this._name = port.name;
    this._port = port;
    this._alreadySubscribed = false;

    if (Ethereum.ethereum) {
      this.subscribeToConnectionEvents();
    }
  }

  start() {
    this.subscribeToConnectionEvents();
  }

  getProviderState() {
    return Ethereum.ethereum.request({ method: 'metamask_getProviderState' });
  }

  setProviderState({ chainId, accounts }) {
    const resChainChanged = {
      data: {
        name: ProviderConstants.PROVIDER,
        data: {
          method: 'metamask_chainChanged',
          params: {
            chainId: `0x${parseInt(chainId, 10).toString(16)}`,
            // For compatibility purposes
            networkVersion: chainId.toString(),
          },
        },
      },
      target: ProviderConstants.INPAGE,
    };

    const resAccountsChanged = {
      data: {
        name: ProviderConstants.PROVIDER,
        data: {
          method: 'metamask_accountsChanged',
          params: [accounts[0]],
        },
      },
      target: ProviderConstants.INPAGE,
    };

    this._onMessage(resChainChanged);
    this._onMessage(resAccountsChanged);

    // No problem in checking the provider state again
    this.getProviderState();
  }

  subscribeToConnectionEvents() {
    if (WalletConnect.forceRestart) {
      WalletConnect.getConnector().killSession();
      WalletConnect.forceRestart = false;
    }

    console.log('WalletConnect.isConnected()', WalletConnect.isConnected());

    Ethereum.ethereum.isConnected = () => WalletConnect.isConnected();

    if (WalletConnect.isConnected()) {
      this.getProviderState();
    }

    if (this._alreadySubscribed) {
      return;
    }

    // Subscribe to connection events
    WalletConnect.getConnector().on('connect', (error, payload) => {
      if (error) {
        throw error;
      }

      // Get provided accounts and chainId
      const { accounts, chainId } = payload.params[0];
      setTimeout(() => {
        this.setProviderState({ accounts, chainId });
      }, 5000);
    });

    WalletConnect.getConnector().on('session_update', (error, payload) => {
      if (error) {
        throw error;
      }
      // Get updated accounts and chainId
      const { accounts, chainId } = payload.params[0];
      this.setProviderState({ accounts, chainId });
    });

    WalletConnect.getConnector().on('disconnect', (error, payload) => {
      if (error) {
        throw error;
      }

      // Delete connector
      location.reload();
    });
    this._alreadySubscribed = true;
  }
}

/**
 * Callback triggered when a message is received from
 * the remote Port associated with this Stream.
 *
 * @private
 * @param {Object} msg - Payload from the onMessage listener of Port
 */
WalletConnectPostMessageStream.prototype._onMessage = function (event) {
  const msg = event.data;
  // validate message
  /* if (this._origin !== '*' && event.origin !== this._origin) {
    return;
  }*/
  if (!msg || typeof msg !== 'object') {
    return;
  }
  if (!msg.data || typeof msg.data !== 'object') {
    return;
  }
  if (msg.target && msg.target !== this._name) {
    return;
  }

  // Filter outgoing messages
  if (msg.data.data?.toNative) {
    return;
  }

  if (Buffer.isBuffer(msg)) {
    // @ts-ignore
    delete msg._isBuffer;
    const data = Buffer.from(msg);
    this.push(data);
  } else {
    this.push(msg);
  }
};

/**
 * Callback triggered when the remote Port
 * associated with this Stream disconnects.
 *
 * @private
 */
WalletConnectPostMessageStream.prototype._onDisconnect = function () {
  this.destroy();
};

/**
 * Explicitly sets read operations to a no-op
 */
WalletConnectPostMessageStream.prototype._read = noop;

/**
 * Called internally when data should be written to
 * this writable stream.
 *
 * @private
 * @param {*} msg Arbitrary object to write
 * @param {string} encoding Encoding to use when writing payload
 * @param {Function} cb Called when writing is complete or an error occurs
 */
WalletConnectPostMessageStream.prototype._write = function (
  msg,
  _encoding,
  cb,
) {
  if (!WalletConnect.isConnected()) return;

  try {
    let data;
    if (Buffer.isBuffer(msg)) {
      data = msg.toJSON();
      // @ts-ignore
      data._isBuffer = true;
    } else {
      if (msg.data) {
        msg.data.toNative = true;
      }
      data = msg;
    }

    console.log("SENDING---")
    WalletConnect.getConnector()
      .sendCustomRequest(data?.data)
      .then((result) => {
        const res = {
          data: {
            name: ProviderConstants.PROVIDER,
            data: {
              id: data.data.id,
              jsonrpc: '2.0',
              result,
            },
          },
          target: ProviderConstants.INPAGE,
        };

        // Returns request result
        this._onMessage(res);
      })
      .catch((error) => {
        // Error returned when rejected
        const res = {
          data: {
            name: ProviderConstants.PROVIDER,
            data: {
              id: data.data.id,
              jsonrpc: '2.0',
              error: error.toString(),
            },
          },
          target: ProviderConstants.INPAGE,
        };

        // Returns request result
        this._onMessage(res);
      });

    const isDesktop = Platform.getPlatform() === PlatformName.DesktopWeb;

    // Check if should open app
    if (METHODS_TO_REDIRECT[data?.data?.method] && !isDesktop) {
      Platform.openLink('https://metamask.app.link/', '_self');
    }
  } catch (err) {
    return cb(new Error('WalletConnectPostMessageStream - disconnected'));
  }
  return cb();
};

export default WalletConnectPostMessageStream;