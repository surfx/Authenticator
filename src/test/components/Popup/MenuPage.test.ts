import "mocha";
import * as chai from "chai";
import { assert } from "chai";
import * as sinonChai from "sinon-chai";
import { createLocalVue, mount, Wrapper } from "@vue/test-utils";
import Vuex, { Store } from "vuex";

import { loadI18nMessages } from "../../../store/i18n";
import MenuPage from "../../../components/Popup/MenuPage.vue";

import { Style } from "../../../store/Style";
import { Accounts } from "../../../store/Accounts";
import { Backup } from "../../../store/Backup";
import { CurrentView } from "../../../store/CurrentView";
import { Menu } from "../../../store/Menu";
import { Notification } from "../../../store/Notification";
import { Qr } from "../../../store/Qr";

import chrome from "sinon-chrome";

chai.should();
chai.use(sinonChai);
mocha.setup("bdd");
const localVue = createLocalVue();

describe("MenuPage", () => {
  before(async () => {
    localVue.prototype.i18n = await loadI18nMessages();
    localVue.use(Vuex);
  });

  let storeOpts = {
    menu: {
      state: {
        version: "1.2.3",
      },
      namespaced: true,
    },
  };

  let store: Store<{}>;

  let wrapper: Wrapper<any>;

  before(() => {
    // mock the chrome global object
    global.chrome.tabs.create = chrome.tabs.create;
    global.chrome.storage.managed.get = chrome.storage.managed.get;
  });

  beforeEach(async () => {
    store = new Vuex.Store({
      modules: storeOpts,
    });
    wrapper = mount(MenuPage, {
      store,
      localVue,
    });
  });

  describe("extension version", () => {
    it("should be displayed", () => {
      assert.equal(wrapper.find("#version").text(), "Version 1.2.3");
    });
  });
});
