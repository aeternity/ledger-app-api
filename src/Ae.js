/********************************************************************************
 *   Ledger Node JS API
 *   (c) 2016-2017 Ledger
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/
//@flow

// FIXME drop:
import type Transport from "@ledgerhq/hw-transport";

const CLA = 0xe0;
const GET_ADDRESS = 0x02;
const SIGN_TRANSACTION = 0x04;
const GET_APP_CONFIGURATION = 0x06;
const SIGN_PERSONAL_MESSAGE = 0x08;

/**
 * aeternity API
 *
 * @example
 * import Ae from "@aeternity/ledger-app-api";
 * const ae = new Ae(transport)
 */
export default class Ae {
  transport: Transport<*>;

  constructor(transport: Transport<*>, scrambleKey: string = "w0w") {
    this.transport = transport;
    transport.decorateAppAPIMethods(
      this,
      [
        "getAddress",
        "signTransaction",
        "signPersonalMessage",
        "getAppConfiguration"
      ],
      scrambleKey
    );
  }

  /**
   * get aeternity address for a given account index.
   * @param {number} accountIndex
   * @option verify optionally enable or disable address verification
   * @return address
   * @example
   * ae.getAddress(0, true).then(address => ...)
   */
  async getAddress(
    accountIndex: number,
    verify: boolean = false
  ): Promise<string> {
    const buffer = new Buffer(4);
    buffer.writeUInt32BE(accountIndex, 0);
    const response = await this.transport.send(
      CLA,
      GET_ADDRESS,
      verify ? 0x01 : 0x00,
      0x00,
      buffer
    );
    const addressLength = response[0];
    return `ak_${response.slice(1, 1 + addressLength).toString("ascii")}`;
  }

  /**
   * You can sign a transaction and retrieve signature given the raw transaction and the index of the account to sign
   * @param {number} accountIndex
   * @param {string} rawTxHex
   * @return signature
   * @example
   * ae.signTransaction(0, "e8018504e3b292008252089428ee52a8f3d6e5d15f8b131996950d7f296c7952872bd72a2487400080").then(signature => ...)
   */
  async signTransaction(
    accountIndex: number,
    rawTxHex: string
  ): Promise<string> {
    let offset = 0;
    const rawTx = new Buffer(rawTxHex, "hex");
    const toSend = [];
    while (offset !== rawTx.length) {
      const maxChunkSize = offset === 0 ? 150 - 4 : 150;
      const chunkSize =
        offset + maxChunkSize > rawTx.length
          ? rawTx.length - offset
          : maxChunkSize;
      const buffer = new Buffer(offset === 0 ? 4 + chunkSize : chunkSize);
      if (offset === 0) {
        buffer.writeUInt32BE(accountIndex, 0);
        rawTx.copy(buffer, 4, offset, offset + chunkSize);
      } else {
        rawTx.copy(buffer, 0, offset, offset + chunkSize);
      }
      toSend.push(buffer);
      offset += chunkSize;
    }
    const response = await toSend.reduce(
      (p, data, i) =>
        p.then(() =>
          this.transport.send(
            CLA,
            SIGN_TRANSACTION,
            i === 0 ? 0x00 : 0x80,
            0x00,
            data
          )
        ),
      Promise.resolve(new Buffer([]))
    );
    return response.slice(0, 64).toString("hex");
  }

  /**
   * You can get an app configuration
   * @example
   * ae.getAppConfiguration().then(config => ...)
   */
  getAppConfiguration(): Promise<{
    arbitraryDataEnabled: number,
    version: string
  }> {
    return this.transport
      .send(CLA, GET_APP_CONFIGURATION, 0x00, 0x00)
      .then(response => {
        let result = {};
        result.arbitraryDataEnabled = response[0] & 0x01;
        result.version =
          "" + response[1] + "." + response[2] + "." + response[3];
        return result;
      });
  }

  /**
  * You can sign a message and retrieve signature given the message and the index of the account to sign.
  * @param {number} accountIndex
  * @param {string} messageHex
  * @return signature
  * @example
  * ae.signPersonalMessage(0, Buffer.from("test").toString("hex")).then(signature => ...)
   */
  async signPersonalMessage(
    accountIndex: number,
    messageHex: string
  ): Promise<string> {
    let offset = 0;
    const message = new Buffer(messageHex, "hex");
    const toSend = [];
    while (offset !== message.length) {
      const maxChunkSize = offset === 0 ? 150 - 4 - 4 : 150;
      const chunkSize =
        offset + maxChunkSize > message.length
          ? message.length - offset
          : maxChunkSize;
      const buffer = new Buffer(offset === 0 ? 4 + 4 + chunkSize : chunkSize);
      if (offset === 0) {
        buffer.writeUInt32BE(accountIndex, 0);
        buffer.writeUInt32BE(message.length, 4);
        message.copy(buffer, 4 + 4, offset, offset + chunkSize);
      } else {
        message.copy(buffer, 0, offset, offset + chunkSize);
      }
      toSend.push(buffer);
      offset += chunkSize;
    }
    const response = await toSend.reduce(
      (p, data, i) =>
        p.then(() =>
          this.transport.send(
            CLA,
            SIGN_PERSONAL_MESSAGE,
            i === 0 ? 0x00 : 0x80,
            0x00,
            data
          )
        ),
      Promise.resolve(new Buffer([]))
    );
    return response.slice(0, 64).toString("hex");
  }
}
