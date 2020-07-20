import * as THREE from 'threejs/three.js'
require('threejs/OrbitControls.js');
import BasicRubik from 'object/Rubik.js'
import TouchLine from 'object/TouchLine'
import TWEEN from 'tween/tween.js';

import ResetBtn from 'object/ResetBtn.js'
import RestoreBtn from 'object/RestoreBtn'
import DisorganizeBtn from './object/DisorganizeBtn'
import SaveBtn from 'object/SaveBtn'

const Context = canvas.getContext('webgl');

/**
 * 圆角矩形
 */
function radiusRect(context, options) {
  var min = options.width > options.height ? options.height : options.width;
  if (options.radius * 2 > min) {
    options.radius = min / 2;
  }
  context.moveTo(options.x + options.radius, options.y);
  context.lineTo(options.x + options.width - options.radius, options.y);
  context.quadraticCurveTo(options.x + options.width, options.y, options.x + options.width, options.y + options.radius);//quadraticCurveTo二次贝塞尔曲线
  context.lineTo(options.x + options.width, options.y + options.height - options.radius);
  context.quadraticCurveTo(options.x + options.width, options.y + options.height, options.x + options.width - options.radius, options.y + options.height);
  context.lineTo(options.x + options.radius, options.y + options.height);
  context.quadraticCurveTo(options.x, options.y + options.height, options.x, options.y + options.height - options.radius);
  context.lineTo(options.x, options.y + options.radius);
  context.quadraticCurveTo(options.x, options.y, options.x + options.radius, options.y);
  context.strokeStyle = options.backgroundColor;
  context.stroke();
  context.fillStyle = options.backgroundColor;
  context.fill();
}

/**
 * 生成半透明背景素材
 */
function background() {
  var color = 'rgba(0,0,0,0.1)';
  var canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 64;
  var context = canvas.getContext('2d');
  context.beginPath();
  radiusRect(context, { radius: 8, width: 80, height: 64, x: 0, y: 0, backgroundColor: color });
  context.closePath();
  return canvas;
}

/**
 * 游戏主函数
 */
export default class Main {
  constructor() {
    this.context = Context; // 绘图上下文
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.devicePixelRatio = window.devicePixelRatio;
    this.viewCenter = new THREE.Vector3(0, 0, 0); // 原点

    this.frontViewName = 'front-rubik'; // 正视角魔方名称
    this.endViewName = 'end-rubik'; // 反视角魔方名称
    this.minPercent = 0.25; // 正反视图至少占25%区域

    this.raycaster = new THREE.Raycaster(); // 碰撞射线
    this.intersect; // 射线碰撞的元素
    this.normalize; // 滑动平面法向量
    this.targetRubik; // 目标魔方
    this.anotherRubik; // 非目标魔方
    this.startPoint; // 触摸点
    this.movePoint; // 滑动点
    this.isRotating = false; // 魔方是否转动

    this.initRender();
    this.initCamera();
    this.initScene();
    this.initLight();
    this.initObject();
    this.initEvent();
    this.render();
  }

  /**
   * 初始化渲染器
   */
  initRender() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      context: this.context
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearColor(0xFFFFFF, 1.0);
    canvas.width = this.width * this.devicePixelRatio;
    canvas.height = this.height * this.devicePixelRatio;
    this.renderer.setPixelRatio(this.devicePixelRatio);
  }

  /**
   * 初始化相机
   */
  initCamera() {
    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 1, 1500);
    this.camera.position.set(0, 0, 300 / this.camera.aspect);
    this.camera.up.set(0, 1, 0); // 正方向
    this.camera.lookAt(this.viewCenter);

    // 轨道视角控制器
    // this.orbitController = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    // this.orbitController.enableZoom = false;
    // this.orbitController.rotateSpeed = 2;
    // this.orbitController.target = this.viewCenter; // 设置控制点

    //透视投影相机视角为垂直视角，根据视角可以求出原点所在裁切面的高度，然后已知高度和宽高比可以计算出宽度
    this.originHeight = Math.tan(22.5 / 180 * Math.PI) * this.camera.position.z * 2;
    this.originWidth = this.originHeight * this.camera.aspect;

    //UI元素逻辑尺寸和屏幕尺寸比率
    this.uiRadio = this.originWidth / window.innerWidth;
  }

  /**
   * 初始化场景
   */
  initScene() {
    this.scene = new THREE.Scene();
  }

  /**
   * 初始化光线
   */
  initLight() {
    this.light = new THREE.AmbientLight(0xfefefe);
    this.scene.add(this.light);
  }

  /**
   * 初始化对象
   */
  initObject() {
    // 正视角魔方
    this.frontRubik = new BasicRubik(this);
    this.frontRubik.model(this.frontViewName);
    this.frontRubik.resizeHeight(0.5, 1);

    // 发视角魔方
    this.endRubik = new BasicRubik(this);
    this.endRubik.model(this.endViewName);
    this.endRubik.resizeHeight(0.5, -1);

    // 滑动控制条
    this.touchLine = new TouchLine(this);
    this.rubikResize((1 - this.minPercent), this.minPercent);//默认正视图占85%区域，反视图占15%区域
    // 执行动画
    this.enterAnimation();

    //重置按钮
    this.resetBtn = new ResetBtn(this);
    this.restoreBtn = new RestoreBtn(this);
    this.disorganizeBtn = new DisorganizeBtn(this);
    this.saveBtn = new SaveBtn(this);
  }

  /**
   * 初始化事件
   */
  initEvent() {
    wx.onTouchStart(this.touchStart.bind(this));
    wx.onTouchMove(this.touchMove.bind(this));
    wx.onTouchEnd(this.touchEnd.bind(this));
  }

  /**
   * 触摸开始
   */
  touchStart(event){
    var touch = event.touches[0];
    this.startPoint = touch;
    if (this.touchLine.isHover(touch)) {
      this.touchLine.enable();
    } else if (this.resetBtn.isHover(touch) && !this.isRotating){
      this.resetBtn.enable();
      this.resetRubik();
    } else if (this.disorganizeBtn.isHover(touch) && !this.isRotating){
      this.disorganizeBtn.enable();
      this.disorganizeRubik();
    } else if (this.saveBtn.isHover(touch) && !this.isRotating){
      this.saveBtn.enable();
      this.saveRubik();
    } else if (this.restoreBtn.isHover(touch) && !this.isRotating){
      this.restoreBtn.enable();
      this.restoreRubik();
    } else {
      this.getIntersects(event);
      if (!this.isRotating && this.intersect) {//触摸点在魔方上且魔方没有转动
        this.startPoint = this.intersect.point;//开始转动，设置起始点
      }
      if (!this.isRotating && !this.intersect) {//触摸点没在魔方上
        this.startPoint = new THREE.Vector2(touch.clientX, touch.clientY);
      }
    }
  }

  /**
   * 触摸移动
   */
  touchMove(event){
    var touch = event.touches[0];
    if (this.touchLine.isActive) {//滑动touchline
      this.touchLine.move(touch.clientY);
      var frontPercent = touch.clientY / window.innerHeight;
      var endPercent = 1 - frontPercent;
      this.rubikResize(frontPercent, endPercent);
    } else if(!this.resetBtn.isActive && !this.disorganizeBtn.isActive && !this.saveBtn.isActive && !this.restoreBtn.isActive)  {
      this.getIntersects(event);
      if (!this.isRotating && this.startPoint && this.intersect) { //滑动点在魔方上且魔方没有转动
        this.movePoint = this.intersect.point;
        if (!this.movePoint.equals(this.startPoint)){//触摸点和滑动点不一样则意味着可以得到转动向量
          this.rotateRubik();
        }
      }
      if (!this.isRotating && this.startPoint && !this.intersect) {//触摸点没在魔方上
        this.movePoint = new THREE.Vector2(touch.clientX, touch.clientY);
        if (!this.movePoint.equals(this.startPoint)) {
          this.rotateView();
        }
      }
    }
  }

  /**
   * 触摸结束
   */
  touchEnd(){
    this.touchLine.disable();
    this.resetBtn.disable();
    this.disorganizeBtn.disable();
    this.saveBtn.disable();
    this.restoreBtn.disable();
  }

  /**
   * 渲染
   */
  render() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.render.bind(this), canvas);
  }

  /**
   * 正反魔方区域占比变化
   */
  rubikResize(frontPercent, endPercent) {
    this.frontRubik.resizeHeight(frontPercent, 1);
    this.endRubik.resizeHeight(endPercent, -1);
  }

  /**
   * 获得视图转动方块索引
   */
  getViewRotateCubeIndex(type) {
    if (type == this.frontViewName) {
      return 10;
    } else {
      return 65;
    }
  }

  /**
   * 获得视图转动方向
   */
  getViewDirection(type, startPoint, movePoint) {
    var direction;
    var rad = 30 * Math.PI / 180;
    var lenX = movePoint.x - startPoint.x;
    var lenY = movePoint.y - startPoint.y;
    if (type == this.frontViewName) {
      if (startPoint.x > window.innerWidth / 2) {
        if (Math.abs(lenY) > Math.abs(lenX) * Math.tan(rad)) {
          if (lenY < 0) {
            direction = 2.1;
          } else {
            direction = 3.1;
          }
        } else {
          if (lenX > 0) {
            direction = 0.3;
          } else {
            direction = 1.3;
          }
        }
      } else {
        if (Math.abs(lenY) > Math.abs(lenX) * Math.tan(rad)) {
          if (lenY < 0) {
            direction = 2.4;
          } else {
            direction = 3.4;
          }
        } else {
          if (lenX > 0) {
            direction = 4.4;
          } else {
            direction = 5.4;
          }
        }
      }
    } else {
      if (startPoint.x > window.innerWidth / 2) {
        if (Math.abs(lenY) > Math.abs(lenX) * Math.tan(rad)) {
          if (lenY < 0) {
            direction = 2.2;
          } else {
            direction = 3.2;
          }
        } else {
          if (lenX > 0) {
            direction = 1.4;
          } else {
            direction = 0.4;
          }
        }
      } else {
        if (Math.abs(lenY) > Math.abs(lenX) * Math.tan(rad)) {
          if (lenY < 0) {
            direction = 2.3;
          } else {
            direction = 3.3;
          }
        } else {
          if (lenX > 0) {
            direction = 5.3;
          } else {
            direction = 4.3;
          }
        }
      }
    }
    return direction;
  }

  /**
   * 获取操作魔方时触摸点坐标以及该触摸点所在平面的法向量
   */
  getIntersects(event) {
    // 因为屏幕坐标系原点在屏幕左上角，而 ThreeJS 中世界坐标系原点被投影到屏幕中心
    // 这里需要把原始的屏幕坐标转换为原点在屏幕中心的屏幕坐标, 并归一化
    let touch = event.touches[0];
    let mouse = new THREE.Vector2();
    mouse.x = (touch.clientX / this.width) * 2 - 1;
    mouse.y = -(touch.clientY / this.height) * 2 + 1;

    // Raycaster射线对象的初始化需要传入转换后的屏幕坐标以及相机对象
    this.raycaster.setFromCamera(mouse, this.camera);

    // 每次碰撞检测其实没必要检测场景中的全部物体
    // 比如如果触摸点的坐标在滑动条的上边，那么被转动的魔方肯定是正视角魔方，反之则是反视角魔方
    let rubikTypeName;
    if (this.touchLine.screenRect.top > touch.clientY) {
      // 滑动正视角魔方
      this.targetRubik = this.frontRubik;
      this.anotherRubik = this.endRubik;
      rubikTypeName = this.frontViewName;
    } else if (this.touchLine.screenRect.top + this.touchLine.screenRect.height < touch.clientY) {
      // 滑动反视角魔方
      this.targetRubik = this.endRubik;
      this.anotherRubik = this.frontRubik;
      rubikTypeName = this.endViewName;
    }

    // 设置射线碰撞元素
    let targetIntersect;
    for (let i = 0; i < this.scene.children.length; i++) {
      if (this.scene.children[i].childType == rubikTypeName) {
        targetIntersect = this.scene.children[i];
        break;
      }
    }

    if (targetIntersect) {
      // 获得待检测的物体后只需要把其传入到Raycaster对象的intersectObjects方法即可
      let intersects = this.raycaster.intersectObjects(targetIntersect.children);
      if (intersects.length >= 2) {
        // 如果外层透明大方块碰撞平面法向量为其坐标系的Y轴，那么滑动平面肯定为魔方上平面，以此类推。
        if (intersects[0].object.cubeType === 'coverCube') {
          this.intersect = intersects[1];
          this.normalize = intersects[0].face.normal;
        } else {
          this.intersect = intersects[0];
          this.normalize = intersects[1].face.normal;
        }
      }
    }
  }

  /**
   * 转动魔方
   */
  rotateRubik() {
    let self = this;
    this.isRotating = true; // 旋转标识置为 true
    // 直接调用Vector3对象的sub方法即可得到滑动方向
    let sub = this.movePoint.sub(this.startPoint); // 计算滑动方向
    let direction = this.targetRubik.getDirection(sub, this.normalize); // 计算转动方向
    let cubeIndex = this.intersect.object.cubeIndex;
    this.targetRubik.rotateMove(cubeIndex, direction);
    let anotherIndex = cubeIndex - this.targetRubik.minCubeIndex + this.anotherRubik.minCubeIndex;
    this.anotherRubik.rotateMove(anotherIndex, direction, function () {
      self.resetRotateParams();
    });
  }

  /**
   * 转动视图
   */
  rotateView() {
    var self = this;
    if (this.startPoint.y < this.touchLine.screenRect.top) {
      this.targetRubik = this.frontRubik;
      this.anotherRubik = this.endRubik;
    } else if (this.startPoint.y > this.touchLine.screenRect.top + this.touchLine.screenRect.height) {
      this.targetRubik = this.endRubik;
      this.anotherRubik = this.frontRubik;
    }
    if (this.targetRubik && this.anotherRubik) {
      this.isRotating = true;//转动标识置为true
      //计算整体转动方向
      var targetType = this.targetRubik.group.childType;
      var cubeIndex = this.getViewRotateCubeIndex(targetType);
      var direction = this.getViewDirection(targetType, this.startPoint, this.movePoint);
      this.targetRubik.rotateMoveWhole(cubeIndex, direction);
      this.anotherRubik.rotateMoveWhole(cubeIndex, direction, function () {
        self.resetRotateParams();
      });
    }
  }

  /**
   * 重置魔方转动参数
   */
  resetRotateParams() {
    this.isRotating = false;
    this.targetRubik = null;
    this.anotherRubik = null;
    this.intersect = null;
    this.normalize = null;
    this.startPoint = null;
    this.movePoint = null;
  }

  /**
   * 进场动画
   */
  enterAnimation() {
    var self = this;
    // 首先定义一个变量用来标识动画结束；
    var isAnimationEnd = false;

    // 定义动画开始前的状态和动画结束后的状态；
    var endStatus = {//目标状态
      rotateY: this.frontRubik.group.rotation.y,
      y: this.frontRubik.group.position.y,
      z: this.frontRubik.group.position.z
    }

    this.frontRubik.group.rotateY(-90 / 180 * Math.PI);//把魔方设置为动画开始状态
    this.frontRubik.group.position.y += this.originHeight / 3;
    this.frontRubik.group.position.z -= 350;

    var startStatus = {//开始状态
      rotateY: this.frontRubik.group.rotation.y,
      y: this.frontRubik.group.position.y,
      z: this.frontRubik.group.position.z
    }

    var tween = new TWEEN.Tween(startStatus)
      .to(endStatus, 2000)
      .easing(TWEEN.Easing.Quadratic.In)
      .onUpdate(function () {
        self.frontRubik.group.rotation.y = startStatus.rotateY;
        self.frontRubik.group.position.y = startStatus.y
        self.frontRubik.group.position.z = startStatus.z
      }).onComplete(function () {
        isAnimationEnd = true;
      });

    function animate(time) {
      if (!isAnimationEnd) {
        requestAnimationFrame(animate);
        TWEEN.update();
      }
    }

    setTimeout(function () {
      tween.start();
      requestAnimationFrame(animate);
    }, 500)

    var stepArr = this.frontRubik.randomRotate();
    this.endRubik.runMethodAtNo(stepArr, 0, function () {
      self.initEvent();//进场动画结束之后才能进行手动操作
    });
  }

  /**
   * 重置正反视图魔方
   */
  resetRubik(){
    this.frontRubik.reset();
    this.endRubik.reset();
  }

  /**
   * 扰乱正反视图魔方
   */
  disorganizeRubik(callback){
    var self = this;
    if(!this.isRotating){
      this.isRotating = true;
      var stepArr = this.frontRubik.randomRotate();
      this.endRubik.runMethodAtNo(stepArr, 0, function(){
        if (callback){
          callback();
        }
        self.resetRotateParams();
      });
    }
  }

  /**
   * 存储魔方
   */
  saveRubik(){
    wx.showLoading({
      title: '存档中...',
      mask:true
    })
    
    var bgCanvas = background();
    var radio = this.originWidth / 750;

    if (!this.tagRubik){
      this.tagRubik = new BasicRubik(this);
      this.tagRubik.model();
    }
    var tagPosition = this.saveBtn.getPosition();
    tagPosition.y -= this.saveBtn.height/2+15;
    tagPosition.x += (this.saveBtn.width - bgCanvas.width) / 2 * radio;
    this.tagRubik.save(this.frontRubik, tagPosition, 0.05);
    this.scene.add(this.tagRubik.group);

    //添加灰色半透明背景
    if (!this.tagRubikBg){
      var bgWidth = bgCanvas.width * radio;
      var bgHeight = bgCanvas.height * radio;
      var geometry = new THREE.PlaneGeometry(bgWidth, bgHeight);
      var texture = new THREE.CanvasTexture(bgCanvas);
      var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
      this.tagRubikBg = new THREE.Mesh(geometry, material);
    }
    this.tagRubikBg.position.x = tagPosition.x;
    this.tagRubikBg.position.y = tagPosition.y;
    this.tagRubikBg.position.z = tagPosition.z;
    this.scene.add(this.tagRubikBg);

    setTimeout(function(){
      wx.hideLoading()
    },500)
  }

  /**
   * 读取魔方
   */
  restoreRubik(){
    if (this.tagRubik){
      this.frontRubik.save(this.tagRubik);
      this.endRubik.save(this.tagRubik);

      if (this.tagRubik) {
        this.scene.remove(this.tagRubik.group);
      }
      if (this.tagRubikBg) {
        this.scene.remove(this.tagRubikBg);
      }
    }
  }
}