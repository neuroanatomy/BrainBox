const store = new WeakMap();

export const getData = (el, key) => {
  const data = store.get(el);

  if (data) {
    return data[key];
  }
};

export const setData = (el, obj) => {
  const existing = store.get(el) || {};
  store.set(el, Object.assign(existing, obj));
};
