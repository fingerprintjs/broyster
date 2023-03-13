(function (FingerprintJS) {
  'use strict';

  function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
      Object.keys(e).forEach(function (k) {
        if (k !== 'default') {
          var d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: function () { return e[k]; }
          });
        }
      });
    }
    n.default = e;
    return Object.freeze(n);
  }

  var FingerprintJS__namespace = /*#__PURE__*/_interopNamespaceDefault(FingerprintJS);

  const startTime = performance.now();
  FingerprintJS__namespace.load({
    token: 'eqySwVqdoKP07TSnyuqW',
  })
    .then((fp) => fp.get())
    .then((result) => {
      document.getElementById('Fingerprint-getTime').innerText = (performance.now() - startTime).toString();
      document.getElementById('Fingerprint-result').innerText = JSON.stringify(result);
      const div = document.createElement('div');
      const content = document.createTextNode('done');
      div.appendChild(content);
      div.setAttribute('id', 'Fingerprint-done');
      const root = document.getElementById('Fingerprint');
      root.appendChild(div);
    });

})(FingerprintJS);
