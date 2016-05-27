(function (console, module, angular, document, Math, trace) {
  function DataLoader() {
    this.labelBuffer = new ArrayBuffer();
    this.imageBuffer = new ArrayBuffer();
    this.onReadyCallback = function () {};
  }

  DataLoader.prototype.loadLabelsAndImages = function (onReadyCallback) {
    this.onReadyCallback = onReadyCallback;
    this.loadData("/NeuralNetwork/data/train-images.idx3-ubyte", this.onLoadImages, this.onCompleteCallback);
    this.loadData("/NeuralNetwork/data/train-labels.idx1-ubyte", this.onLoadLabels, this.onCompleteCallback);
  };

  DataLoader.prototype.onCompleteCallback = function () {
    if (this.labelBuffer.byteLength > 0 && this.imageBuffer.byteLength > 0) {
      this.onReadyCallback.call(null);
      console.log("All data loaded");
    }
  };

  DataLoader.prototype.loadData = function (url, callback, onLoadCallback) {
    var that = this;
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function (event) {
      var u8 = new Uint8Array(xhr.response);
      console.log("loaded %s %s", url, u8);
      var dv = new DataView(xhr.response);
      var magic = dv.getUint32(0);
      var itemCount = dv.getUint32(4);
      for (var i = 8; i < 16; i++) {
        //console.log(dv.getUint8(i));
      }
      console.log("magic %d count %d", magic, itemCount);
      callback.call(that, xhr.response);
      onLoadCallback.call(that);
    };
    xhr.onerror = function (event) {
      console.log("error ", event);
    };
    xhr.send();
  };

  DataLoader.prototype.onLoadLabels = function (arrayBuffer) {
    this.labelBuffer = arrayBuffer;
  };

  DataLoader.prototype.onLoadImages = function (arrayBuffer) {
    this.imageBuffer = arrayBuffer;
  };

  DataLoader.prototype.getImageCount = function () {
    var dataView = new DataView(this.labelBuffer);
    var imageCount = dataView.getUint32(4);
    return imageCount;
  };

  DataLoader.prototype.getImage = function (number) {
    var labelsDataView = new DataView(this.labelBuffer);
    var label = labelsDataView.getUint8(8 + number);
    var imagesDataView = new DataView(this.imageBuffer);
    var width = imagesDataView.getUint32(12);
    var height = imagesDataView.getUint32(8);
    var size = width * height;
    var firstImageStart = 16;
    var imageData = new Uint8Array(this.imageBuffer, firstImageStart + size * number, size);
    return new NumberImage(width, height, label, imageData);
  };

  function NumberImage(width, height, label, imageData) {
    this.width = width;
    this.height = height;
    this.label = label;
    this.image = imageData;
    if (trace > 1) {
      console.log("image %dx%d pixels label %s", width, height, label);
    }
  }

  NumberImage.prototype.createElement = function () {
    var htmlLines = [
      '<canvas width="',
      this.width,
      '" height="',
      this.height,
      '" title="',
      this.label,
      '">',
      '</canvas>'
    ];
    var canvasAngularElement = angular.element(htmlLines.join(""));
    var canvas = canvasAngularElement[0];
    var context = canvas.getContext('2d');
    var id = context.createImageData(this.width, this.height);
    var data = id.data;
    for (var i = 0; i < this.image.byteLength; i++) {
      var val = 255 - this.image[i];
      data[i * 4 + 0] = val;
      data[i * 4 + 1] = val;
      data[i * 4 + 2] = val;
      data[i * 4 + 3] = 255;
    }
    context.putImageData(id, 0, 0);
    return canvasAngularElement;
  };

  function NeuralNetwork(inputLayerSize, hiddenLayerSize, outputLayerSize) {
    this.inputLayer = new Layer(inputLayerSize);
    this.hiddenLayer = new Layer(hiddenLayerSize);
    this.outputLayer = new Layer(outputLayerSize);
    
    this.inputLayer.connectTo(this.hiddenLayer);
    this.hiddenLayer.connectTo(this.outputLayer);
    console.log(this);
  }

  function Layer(size) {
    this.size = size;
    this.biases;
    this.weights;
    this.nextLayer;
    this.previousLayer;
  }

  Layer.prototype.initBiases = function () {
    this.biases = new Array(this.size);
    for (var i = 0; i < this.size; i++) {
      this.biases[i] = Math.random() * 0.2 - 0.1;
    }
  };
  
  Layer.prototype.connectTo = function(nextLayer) {
    this.nextLayer = nextLayer;
    nextLayer.previousLayer = this;
    nextLayer.initBiases();
    nextLayer.initWeights();
  };
  
  Layer.prototype.initWeights = function () {
    var previousLayerSize = this.previousLayer.size;
    var weights = new Array(this.size);
    for (var i = 0; i < this.size; i++) {
      weights[i] = new Array(previousLayerSize);
      for (var j = 0; j < previousLayerSize; j++) {
        weights[i][j] = Math.random() * 0.2 - 0.1;
      }
    }
    this.weights = weights;
  };

  var dataLoader = new DataLoader();
  dataLoader.loadLabelsAndImages(function () {
    var imageCount = dataLoader.getImageCount();
    for (var i = 0; i < 50; i++) {
      var image = dataLoader.getImage(i);
      var canvasAngularElement = image.createElement();
      angular.element(document.body).append(canvasAngularElement);
    }
  });
  var net = new NeuralNetwork(3, 3, 3);
})(console, angular.module('neuralNetworkApp', []), angular, document, Math, 1);


