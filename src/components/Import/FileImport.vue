<template>
  <div>
    <a-file-input
      button-type="file"
      accept="application/json, text/plain, text/csv, .csv"
      v-if="!getFilePassphrase"
      @change="importFile($event, true)"
      :label="i18n.import_backup_file"
    />
    <div class="import_file_passphrase" v-else>
      <p class="error_password">{{ i18n.passphrase_info }}</p>
      <a-text-input
        :label="i18n.phrase"
        type="password"
        @enter="readFilePassphrase = true"
        v-model="importFilePassphrase"
      />
      <a-button @click="readFilePassphrase = true">{{ i18n.ok }}</a-button>
    </div>
  </div>
</template>
<script lang="ts">
import * as CryptoJS from "crypto-js";
import Vue from "vue";
import {
  decryptBackupData,
  getEntryDataFromOTPAuthPerLine,
} from "../../importHelpers";
import { EntryStorage } from "../../models/storage";
import { Encryption } from "../../models/encryption";
import { parseAccounts } from "../../models/csv";

export default Vue.extend({
  data: function () {
    return {
      getFilePassphrase: false,
      readFilePassphrase: false,
      importFilePassphrase: "",
    };
  },
  methods: {
    importFile(event: Event, closeWindow: Boolean) {
      const target = event.target as HTMLInputElement;
      if (!target || !target.files) {
        return;
      }
      if (target.files[0]) {
        const reader = new FileReader();
        let decryptedFileData: { [hash: string]: RawOTPStorage } = {};
        reader.onload = async () => {
          let importData: {
            // @ts-ignore
            key?: { enc: string; hash: string };
            [hash: string]: RawOTPStorage | Key;
            // Bug #557, uploaded backups were missing `key`
            // @ts-ignore
            enc?: string;
            // @ts-ignore
            hash?: string;
          } = {};
          let failedCount = 0;
          let succeededCount = 0;
          const textResult = reader.result as string;
          try {
            importData = JSON.parse(textResult);
            succeededCount = Object.keys(importData).filter(
              (key) => ["key", "enc", "hash"].indexOf(key) === -1
            ).length;
          } catch (e) {
            console.warn(e);
            const accounts = parseAccounts(textResult);
            if (accounts.length) {
              importData = {};
              for (const account of accounts) {
                const hash = crypto.randomUUID();
                importData[hash] = ({
                  hash,
                  type: account.type || "totp",
                  encrypted: false,
                  index: 0,
                  counter: account.counter,
                  pinned: false,
                  issuer: account.issuer,
                  account: account.account,
                  secret: account.secret,
                  period: account.period,
                  digits: account.digits,
                  algorithm: account.algorithm,
                } as unknown) as RawOTPStorage;
              }
              succeededCount = accounts.length;
            } else {
              const result = await getEntryDataFromOTPAuthPerLine(textResult);
              importData = result.exportData;
              failedCount = result.failedCount;
              succeededCount = result.succeededCount;
            }
          }

          let key: { enc: string } | null = null;

          if (importData.hasOwnProperty("key")) {
            if (importData.key) {
              key = importData.key;
            }
            delete importData.key;
          } else if (importData.enc && importData.hash) {
            key = { enc: importData.enc };
            delete importData.hash;
            delete importData.enc;
          }

          for (const hash in importData) {
            const possibleEntry = importData[hash];
            if (possibleEntry.dataType === "Key") {
              // don't try to import keys as an OTPEntry
              continue;
            }

            if (possibleEntry.keyId || possibleEntry.encrypted) {
              try {
                const oldPassphrase:
                  | string
                  | null = await this.getOldPassphrase();

                if (key) {
                  // v2 encryption
                  decryptedFileData = await decryptBackupData(
                    importData,
                    CryptoJS.AES.decrypt(key.enc, oldPassphrase).toString()
                  );
                } else {
                  // v3 and v1 encryption
                  decryptedFileData = await decryptBackupData(
                    importData,
                    oldPassphrase
                  );
                }

                break;
              } catch {
                break;
              }
            } else {
              decryptedFileData[hash] = possibleEntry;
            }
          }
          if (Object.keys(decryptedFileData).length) {
            await EntryStorage.import(
              this.$encryption as Encryption,
              decryptedFileData
            );
            if (failedCount === 0) {
              alert(this.i18n.updateSuccess);
            } else if (succeededCount) {
              alert(this.i18n.migration_partly_fail);
            } else {
              alert(this.i18n.migration_fail);
            }

            if (closeWindow) {
              window.close();
            }
          } else {
            alert(this.i18n.migration_fail);
            this.getFilePassphrase = false;
            this.importFilePassphrase = "";
          }
        };
        reader.readAsText(target.files[0], "utf8");
      } else {
        alert(this.i18n.migration_fail);
        if (closeWindow) {
          window.close();
        }
      }
      return;
    },
    async getOldPassphrase() {
      this.getFilePassphrase = true;
      while (true) {
        if (this.readFilePassphrase) {
          if (this.importFilePassphrase) {
            this.readFilePassphrase = false;
            break;
          } else {
            this.readFilePassphrase = false;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return this.importFilePassphrase;
    },
  },
});
</script>
