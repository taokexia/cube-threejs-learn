import * as THREE from 'threejs/three.js'
require('threejs/OrbitControls.js');
import BasicRubik from 'object/Rubik.js'
import TouchLine from 'object/TouchLine'

const Context = canvas.getContext('webgl');

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
    } else {
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
}