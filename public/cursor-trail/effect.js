/*
 * WebGL cursor trail — adapted from the effect on osumatrix.me
 * (itself derived from a CodePen shader study). Runs only on non-touch,
 * wide viewports without a reduced-motion preference. The noise texture
 * is generated locally instead of fetched from a third-party CDN.
 */
(function () {
	var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	var coarse = window.matchMedia('(pointer: coarse)').matches;
	if (window.innerWidth <= 500 || reduce || coarse || typeof THREE === 'undefined') return;
	if (!hasWebGL()) return;

	function hasWebGL() {
		try {
			var c = document.createElement('canvas');
			return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
		} catch (e) {
			return false;
		}
	}

	var camera, scene, renderer, uniforms;
	var divisor = 1 / 5;
	var rtTexture, rtTexture2;
	var new_mouse = { x: 0, y: 0 };

	// Locally generated noise texture (replaces the external CDN image).
	var noiseCanvas = document.createElement('canvas');
	noiseCanvas.width = noiseCanvas.height = 256;
	var nctx = noiseCanvas.getContext('2d');
	var imgData = nctx.createImageData(256, 256);
	for (var i = 0; i < imgData.data.length; i += 4) {
		var v = Math.random() * 255;
		imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = v;
		imgData.data[i + 3] = 255;
	}
	nctx.putImageData(imgData, 0, 0);

	var texture = new THREE.Texture(noiseCanvas);
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.minFilter = THREE.LinearFilter;
	texture.needsUpdate = true;

	init();

	async function init() {
		camera = new THREE.Camera();
		camera.position.z = 1;

		scene = new THREE.Scene();

		var geometry = new THREE.PlaneBufferGeometry(2, 2);

		rtTexture = new THREE.WebGLRenderTarget(window.innerWidth * 0.2, window.innerHeight * 0.2);
		rtTexture2 = new THREE.WebGLRenderTarget(window.innerWidth * 0.2, window.innerHeight * 0.2);

		uniforms = {
			u_time: { type: 'f', value: 1.0 },
			u_resolution: { type: 'v2', value: new THREE.Vector2() },
			u_noise: { type: 't', value: texture },
			u_buffer: { type: 't', value: rtTexture.texture },
			u_mouse: { type: 'v2', value: new THREE.Vector2() },
			u_renderpass: { type: 'b', value: false }
		};

		var shaders = await Promise.all([
			fetch('/cursor-trail/vertex.glsl').then(function (r) { return r.text(); }),
			fetch('/cursor-trail/fragment.glsl').then(function (r) { return r.text(); })
		]);

		var material = new THREE.ShaderMaterial({
			uniforms: uniforms,
			vertexShader: shaders[0],
			fragmentShader: shaders[1]
		});

		material.extensions.derivatives = true;

		scene.add(new THREE.Mesh(geometry, material));

		renderer = new THREE.WebGLRenderer();
		renderer.setPixelRatio(window.devicePixelRatio);

		document.body.prepend(renderer.domElement);

		onWindowResize();
		window.addEventListener('resize', onWindowResize, false);
		window.addEventListener('orientationchange', onWindowResize, false);

		document.addEventListener('pointermove', function (e) {
			var ratio = window.innerHeight / window.innerWidth;
			new_mouse.x = (e.pageX - window.innerWidth / 2) / window.innerWidth / ratio;
			new_mouse.y = ((e.pageY - window.innerHeight / 2) / window.innerHeight) * -1;
		});

		animate();
	}

	function onWindowResize() {
		renderer.setSize(window.innerWidth, window.innerHeight);
		uniforms.u_resolution.value.x = renderer.domElement.width;
		uniforms.u_resolution.value.y = renderer.domElement.height;

		rtTexture = new THREE.WebGLRenderTarget(window.innerWidth * 0.2, window.innerHeight * 0.2);
		rtTexture2 = new THREE.WebGLRenderTarget(window.innerWidth * 0.2, window.innerHeight * 0.2);
	}

	function animate(delta) {
		setTimeout(function () {
			requestAnimationFrame(animate);
		}, 1000 / 144);

		uniforms.u_mouse.value.x += (new_mouse.x - uniforms.u_mouse.value.x) * divisor;
		uniforms.u_mouse.value.y += (new_mouse.y - uniforms.u_mouse.value.y) * divisor;

		uniforms.u_time.value = delta * 0.0005;
		renderer.render(scene, camera);

		var odims = uniforms.u_resolution.value.clone();
		uniforms.u_resolution.value.x = window.innerWidth * 0.2;
		uniforms.u_resolution.value.y = window.innerHeight * 0.2;

		uniforms.u_buffer.value = rtTexture2.texture;
		uniforms.u_renderpass.value = true;

		renderer.setRenderTarget(rtTexture);
		renderer.render(scene, camera, rtTexture, true);

		var buffer = rtTexture;
		rtTexture = rtTexture2;
		rtTexture2 = buffer;

		uniforms.u_buffer.value = rtTexture.texture;
		uniforms.u_resolution.value = odims;
		uniforms.u_renderpass.value = false;
	}
})();
