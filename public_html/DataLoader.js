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

  NumberImage.prototype.toArray = function () {
    var len = this.image.byteLength, i, arr = new Array(len);
    for (i = 0; i < len; i++) {
      arr[i] = this.image[i];
    }
    return arr;
  };

  function NeuralNetwork(inputLayerSize, hiddenLayerSize, outputLayerSize) {
    this.inputLayer = new Layer(inputLayerSize);
    this.hiddenLayer = new Layer(hiddenLayerSize);
    this.outputLayer = new Layer(outputLayerSize);

    this.inputLayer.connectTo(this.hiddenLayer);
    this.hiddenLayer.connectTo(this.outputLayer);
    this.trace = false;
    console.log(this);
  }

  NeuralNetwork.prototype.feedForward = function (a) {
    var results = [];
    a = this.inputLayer.activate(a);
    if (this.trace) {
      results.push(a);
    }
    a = this.hiddenLayer.activate(a);
    if (this.trace) {
      results.push(a);
    }
    a = this.outputLayer.activate(a);
    if (this.trace) {
      results.push(a);
      console.table(results);
    }
    return a;
  };

  NeuralNetwork.prototype.SGD = function (trainingData, epochs, miniBatchSize, eta, testDataOrUndefined) {
    var i, j, nTest, n;
    if (testDataOrUndefined) {
      nTest = testDataOrUndefined.length;
    }
    n = trainingData.length;
    for (i = 0; i < epochs; i++) {
      console.groupCollapsed('Epoch %d', i);
      trainingData.shuffle();
      var miniBatches = [];
      for (j = 0; j < n; j += miniBatchSize) {
        miniBatches.push(trainingData.slice(j, j + miniBatchSize));
      }
      for (j = 0; j < miniBatches.length; j++) {
        this.updateMiniBatch(miniBatches[j], eta);
      }
      if (testDataOrUndefined) {
        console.log("Epoch %d: %d / %d", i, this.evaluate(testDataOrUndefined), nTest);
      } else {
        console.log("Epoch %d complete", i);
      }
      console.groupEnd('Epoch %d', i);
    }
  };

  NeuralNetwork.prototype.updateMiniBatch = function (miniBatch, eta) {
    console.groupCollapsed('minibatch');
    this.hiddenLayer.initNablaBiases();
    this.hiddenLayer.initNablaWeights();
    this.outputLayer.initNablaBiases();
    this.outputLayer.initNablaWeights();
    var miniBatchSize = miniBatch.length;
    for (var i = 0; i < miniBatchSize; i++) {
      this.backprop(miniBatch[i][0], miniBatch[i][1]);
    }
    this.hiddenLayer.updateBiases(miniBatchSize, eta);
    this.hiddenLayer.updateWeights(miniBatchSize, eta);
    this.outputLayer.updateBiases(miniBatchSize, eta);
    this.outputLayer.updateWeights(miniBatchSize, eta);
    console.groupEnd('minibatch');
  };

  NeuralNetwork.prototype.backprop = function (x, y) {
//    this.hiddenLayer.initNablaBiases();
//    this.hiddenLayer.initNablaWeights();
//    this.outputLayer.initNablaBiases();
//    this.outputLayer.initNablaWeights();

    this.feedForward(x);

    var delta = this.outputLayer.mul(this.outputLayer.costDerivative(this.outputLayer.output, y), this.outputLayer.sigmoidPrime(this.outputLayer.z));
    for (var i = 0; i < delta.length; i++) {
      this.outputLayer.nablaWeights[i] = this.outputLayer.sum(this.outputLayer.nablaWeights[i], this.outputLayer.mulToScalar(this.hiddenLayer.output, delta[i]));
    }

    var sp = this.hiddenLayer.sigmoidPrime(this.hiddenLayer.z);
    //var delta = this.hiddenLayer.sum(this.hiddenLayer.dot(this.outputLayer.weights, delta), sp);
    var delta2 = [];
    for (var i = 0; i < this.outputLayer.weights.length; i++) {
      var a = this.hiddenLayer.sum(this.hiddenLayer.mulToScalar(this.outputLayer.weights[i], delta[i]), sp);
      if (i == 0) {
        delta2 = a;
      } else {
        delta2 = this.hiddenLayer.sum(delta2, a);
      }
    }
    this.hiddenLayer.nablaBiases = this.hiddenLayer.sum(this.hiddenLayer.nablaBiases, delta2);
    for (var i = 0; i < this.hiddenLayer.nablaWeights.length; i++) {
      this.hiddenLayer.nablaWeights[i] = this.hiddenLayer.sum(this.hiddenLayer.nablaWeights[i], this.hiddenLayer.mulToScalar(this.inputLayer.activation, delta2[i]));
    }
  };

  NeuralNetwork.prototype.evaluate = function (testData) {
    return 1;
  };

  function Layer(size) {
    this.size = size;
    this.biases;
    this.weights;
    this.nextLayer;
    this.previousLayer;
    this.nablaBiases;
    this.nablaWeights;
    this.activation;
    this.z;
    this.output;
  }

  Layer.prototype.initBiases = function () {
    this.biases = new Array(this.size);
    for (var i = 0; i < this.size; i++) {
      this.biases[i] = this.random();
    }
  };

  Layer.prototype.initNablaBiases = function () {
    var nablaBiases;
    nablaBiases = new Array(this.size);
    for (var i = 0; i < this.size; i++) {
      nablaBiases[i] = 0;
    }
    this.nablaBiases = nablaBiases;
  };

  Layer.prototype.connectTo = function (nextLayer) {
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
        weights[i][j] = this.random();
      }
    }
    this.weights = weights;
  };

  Layer.prototype.initNablaWeights = function () {
    var nablaWeights;
    if (this.weights) {
      var previousLayerSize = this.previousLayer.size;
      nablaWeights = new Array(this.size);
      for (var i = 0; i < this.size; i++) {
        nablaWeights[i] = new Array(previousLayerSize);
        for (var j = 0; j < previousLayerSize; j++) {
          nablaWeights[i][j] = 0;
        }
      }
    }
    this.nablaWeights = nablaWeights;
  };

  Layer.prototype.updateWeights = function (miniBatchSize, eta) {
    var weights = this.weights, len = weights.length, nablaWeights = this.nablaWeights, factor = eta / miniBatchSize;

    for (var i = 0; i < len; i++) {
      //weights[i] = (weights[i] - eta / miniBatchSize) * nablaWeights[i];
      weights[i] = this.sub(weights[i], this.mulToScalar(nablaWeights[i], factor))
      //weights[i] = (weights[i] - eta / miniBatchSize) * nablaWeights[i];
    }
    this.weights = weights;
  };

  Layer.prototype.updateBiases = function (miniBatchSize, eta) {
    var biases = this.biases, len = biases.length, nablaBiases = this.nablaBiases;
    for (var i = 0; i < len; i++) {
      biases[i] = (biases[i] - eta / miniBatchSize) * nablaBiases[i];
    }
    this.biases = biases;
  };

  Layer.prototype.random = function () {
    return Math.random() * 0.2 - 0.1;
  };

  Layer.prototype.activate = function (a) {
    var result;
    this.activation = a;
    if (this.weights && this.biases) {
      result = this.z = this.wab(a);
      result = this.output = this.sigmoid(result);
    } else {
      result = this.output = a;
    }
    return result;
  };

  Layer.prototype.wab = function (a) {
    var size = this.size;
    var result = new Array(size);
    for (var i = 0; i < size; i++) {
      result[i] = this.dot(this.weights[i], a);
    }
    return this.sum(result, this.biases);
  };

  Layer.prototype.dot = function (a, b) {
    var length = a.length,
            i = 0,
            result = 0;
    for (i = 0; i < length; i++) {
      result += a[i] * b[i];
    }
    return result;
  };

  Layer.prototype.dot2 = function (a, b) {
    var length = a.length,
            i = 0,
            result = 0;
    for (i = 0; i < length; i++) {
      result += a[i] * b[i];
    }
    return result;
  };

  Layer.prototype.sum = function (a, b) {
    var length = a.length,
            i = 0,
            result = new Array(length);
    for (i = 0; i < length; i++) {
      result[i] = a[i] + b[i];
    }
    return result;
  };

  Layer.prototype.mul = function (a, b) {
    var length = a.length,
            i = 0,
            result = new Array(length);
    for (i = 0; i < length; i++) {
      result[i] = a[i] * b[i];
    }
    return result;
  };

  Layer.prototype.mulToScalar = function (a, b) {
    var length = a.length,
            i = 0,
            result = new Array(length);
    for (i = 0; i < length; i++) {
      result[i] = a[i] * b;
    }
    return result;
  };

  Layer.prototype.sub = function (a, b) {
    var length = a.length,
            i = 0,
            result = new Array(length);
    for (i = 0; i < length; i++) {
      result[i] = a[i] - b[i];
    }
    return result;
  };

  Layer.prototype.costDerivative = function (a, b) {
    return this.sub(a, b);
  };

  Layer.prototype.sigmoid = function (z) {
    var result;
    if (Array.isArray(z)) {
      var len = z.length, i = 0,
              result = new Array(len);
      for (i = 0; i < len; i++) {
        result[i] = this.sigmoid(z[i]);
      }
    } else {
      result = 1.0 / (1.0 + Math.exp(-z));
    }
    return result;
  };

  Layer.prototype.sigmoidPrime = function (z) {
    var result;
    if (Array.isArray(z)) {
      var len = z.length, i = 0,
              result = new Array(len);
      for (i = 0; i < len; i++) {
        result[i] = this.sigmoidPrime(z[i]);
      }
    } else {
      result = this.sigmoid(z) * (1.0 - this.sigmoid(z));
    }
    return result;
  };

  var dataLoader = new DataLoader();
  dataLoader.loadLabelsAndImages(function () {
    var imageCount = dataLoader.getImageCount();
    var traningData = [];
    var n = 5000;
    for (var i = 0; i < n; i++) {
      var image = dataLoader.getImage(i);
      var input = image.toArray();
      var output = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      output[image.label] = 1;
      traningData.push([input, output]);
    }
    //console.table(traningData);
    var net = new NeuralNetwork(input.length, 30, 10);
    net.SGD(traningData, 30, 10, 0.7);
    var passed = 0, failed = 0, total = 0;
    for (var i = 0; i < n; i++) {
      var image = dataLoader.getImage(i);
      var input = image.toArray();
      var output = net.feedForward(input);
      var expected = image.label, actual = output.indexOfMaxElement(), success = expected === actual;
      if (success) {
        passed++;
      } else {
        var canvasAngularElement = image.createElement();
        angular.element(document.body).append(canvasAngularElement);
        failed++;
      }
      total++;
      console.log("expected %d, actual %d, success %s", expected, actual, success);
    }
    console.log("passed %d, failed %d, total %d", passed, failed, total);
  });

  Array.prototype.indexOfMaxElement = function () {
    var len = this.length, maxElementIndex = 0, maxElement = this[maxElementIndex], i;
    for (var i = 1; i < len; i++) {
      if (this[i] > maxElement) {
        maxElement = this[i];
        maxElementIndex = i;
      }
    }
    return maxElementIndex;
  };

  Array.prototype.shuffle = function () {
    var len = this.length, randomIndex, i = 0;
    for (var i = 0; i < len; i++) {
      randomIndex = Math.floor(Math.random() * len);
      if (i !== randomIndex) {
        var tmp = this[randomIndex];
        this[randomIndex] = this[i];
        this[i] = tmp;
      }
    }
  };

  Array.prototype.testShuffle = function () {
    var arr = [1, 2, 3, 4, 5, 6, 7];
    arr.shuffle();
    console.table([arr]);
  };

})(console, angular.module('neuralNetworkApp', []), angular, document, Math, 1);


