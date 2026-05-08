import { describe, it, expect, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { VueBoostgrid } from "../src";

describe("VueBoostgrid mount lifecycle", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("renders an empty host div containing a built table after mount", async () => {
    const wrapper = mount(VueBoostgrid, {
      props: {
        data: [
          { id: 1, name: "alpha" },
          { id: 2, name: "beta" },
        ],
        columns: [
          { id: "id", text: "ID", identifier: true, type: "numeric" },
          { id: "name", text: "Name" },
        ],
        options: { navigation: 0 },
      },
    });
    await flushPromises();

    const table = wrapper.element.querySelector("table");
    expect(table).not.toBeNull();
    const headerCells = table!.querySelectorAll("thead th");
    expect(headerCells.length).toBe(2);
    expect(headerCells[0].textContent).toBe("ID");

    const rows = table!.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);

    wrapper.unmount();
  });

  it("syncs data updates by clearing + appending", async () => {
    const wrapper = mount(VueBoostgrid, {
      props: {
        data: [{ id: 1, name: "alpha" }],
        columns: [
          { id: "id", text: "ID", identifier: true, type: "numeric" },
          { id: "name", text: "Name" },
        ],
        options: { navigation: 0 },
      },
    });
    await flushPromises();
    expect(wrapper.element.querySelectorAll("tbody tr").length).toBe(1);

    await wrapper.setProps({
      data: [
        { id: 1, name: "alpha" },
        { id: 2, name: "beta" },
        { id: 3, name: "gamma" },
      ],
    });
    await flushPromises();
    expect(wrapper.element.querySelectorAll("tbody tr").length).toBe(3);
    wrapper.unmount();
  });

  it("destroy on unmount removes the boostgrid wrapper from the host", async () => {
    const wrapper = mount(VueBoostgrid, {
      props: {
        data: [{ id: 1, name: "alpha" }],
        columns: [
          { id: "id", text: "ID", identifier: true, type: "numeric" },
          { id: "name", text: "Name" },
        ],
        options: { navigation: 0 },
      },
      attachTo: document.body,
    });
    await flushPromises();
    expect(document.body.querySelector(".boostgrid")).not.toBeNull();
    wrapper.unmount();
    expect(document.body.querySelector(".boostgrid")).toBeNull();
  });
});
